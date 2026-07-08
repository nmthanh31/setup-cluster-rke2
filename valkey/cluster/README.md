# Hướng dẫn cài đặt Valkey Cluster trên Kubernetes

Tài liệu này mô tả cách cài đặt Valkey theo mô hình Cluster từ các manifest trong thư mục `valkey/cluster`.

Mô hình này khác với Sentinel HA:

- Valkey Cluster chia dữ liệu theo hash slot trên nhiều master.
- Mỗi master có replica để dự phòng.
- Client ứng dụng phải hỗ trợ Valkey/Redis Cluster.
- Không dùng Sentinel để tìm primary; client cluster sẽ tự xử lý redirect qua `MOVED`/`ASK`.

## 1. Kiến trúc

Cụm hiện tại dùng 6 pod Valkey:

- 3 master.
- 3 replica.
- Mỗi master có 1 replica, cấu hình bằng `--cluster-replicas 1`.

Các thành phần:

| Thành phần | Manifest | Mô tả |
| --- | --- | --- |
| Namespace | `namespace.yaml` | Tạo namespace `valkey-cluster`. |
| ConfigMap | `configmap.yaml` | Chứa script khởi động Valkey với `cluster-enabled yes`. |
| Headless Service | `service-headless.yaml` | Tạo DNS ổn định cho các pod StatefulSet và mở port cluster bus. |
| StatefulSet | `statefulset.yaml` | Chạy 6 pod Valkey Cluster. |
| Secret | Tạo bằng lệnh bên dưới | Chứa mật khẩu xác thực Valkey. |

Thông tin quan trọng:

- Namespace: `valkey-cluster`
- StatefulSet: `valkey-cluster`
- Số pod: `6`
- Client port: `6379`
- Cluster bus port: `16379`
- Image: `valkey/valkey:9.1.0`
- StorageClass: `longhorn`
- Dung lượng mỗi PVC: `2Gi`
- Secret chứa mật khẩu: `valkey-cluster-auth`

## 2. Điều kiện trước khi cài đặt

Cần có:

- Kubernetes cluster đã sẵn sàng.
- `kubectl` đã cấu hình đúng context.
- StorageClass `longhorn` tồn tại nếu giữ nguyên `statefulset.yaml`.
- Network nội bộ cho phép các pod giao tiếp qua port `6379` và `16379`.
- Ứng dụng hoặc công cụ kiểm thử hỗ trợ Valkey/Redis Cluster.

Kiểm tra StorageClass:

```bash
kubectl get storageclass
```

Nếu cluster không có StorageClass `longhorn`, hãy sửa `storageClassName` trong `statefulset.yaml` sang StorageClass phù hợp trước khi apply.

## 3. Tạo namespace và secret

Apply namespace:

```bash
kubectl apply -f valkey/cluster/namespace.yaml
```

Tạo secret chứa mật khẩu Valkey:

```bash
kubectl -n valkey-cluster create secret generic valkey-cluster-auth \
  --from-literal=password='CHANGE_ME_STRONG_PASSWORD'
```

Nếu secret đã tồn tại và muốn cập nhật mật khẩu:

```bash
kubectl -n valkey-cluster delete secret valkey-cluster-auth
kubectl -n valkey-cluster create secret generic valkey-cluster-auth \
  --from-literal=password='CHANGE_ME_STRONG_PASSWORD'
```

Lưu ý: Nếu đổi mật khẩu sau khi cụm đã chạy, cần restart các pod Valkey để đọc lại secret.

## 4. Apply manifest

Chạy từ thư mục gốc repo:

```bash
kubectl apply -f valkey/cluster/configmap.yaml
kubectl apply -f valkey/cluster/service-headless.yaml
kubectl apply -f valkey/cluster/statefulset.yaml
```

Theo dõi pod:

```bash
kubectl -n valkey-cluster get pods -w
```

Hoặc đợi tất cả pod sẵn sàng:

```bash
kubectl -n valkey-cluster wait --for=condition=Ready pod \
  -l app=valkey-cluster \
  --timeout=300s
```

Kết quả mong đợi:

```text
valkey-cluster-0    1/1     Running
valkey-cluster-1    1/1     Running
valkey-cluster-2    1/1     Running
valkey-cluster-3    1/1     Running
valkey-cluster-4    1/1     Running
valkey-cluster-5    1/1     Running
```

Kiểm tra service và PVC:

```bash
kubectl -n valkey-cluster get svc
kubectl -n valkey-cluster get pvc
```

## 5. Khởi tạo Valkey Cluster

Sau khi 6 pod đã chạy, cần chạy lệnh `--cluster create` một lần để tạo cluster và phân bổ hash slot.

Lấy mật khẩu từ secret:

```bash
VALKEY_PASSWORD="$(kubectl -n valkey-cluster get secret valkey-cluster-auth -o jsonpath='{.data.password}' | base64 -d)"
```

Khởi tạo cluster với 3 master và 3 replica:

```bash
kubectl -n valkey-cluster exec -it valkey-cluster-0 -- sh -c "
yes yes | valkey-cli -a \"$VALKEY_PASSWORD\" --cluster create \
  valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
  valkey-cluster-1.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
  valkey-cluster-2.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
  valkey-cluster-3.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
  valkey-cluster-4.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
  valkey-cluster-5.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
  --cluster-replicas 1
"
```

Lưu ý:

- Lệnh này chỉ chạy sau khi các pod chưa được tạo cluster.
- Nếu đã tạo cluster trước đó, không chạy lại `--cluster create` trên cùng dữ liệu PVC.
- Nếu muốn tạo lại từ đầu, cần xóa StatefulSet và PVC cũ trước.

## 6. Kiểm tra trạng thái cluster

Kiểm tra thông tin cluster:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster info"
```

Kết quả mong đợi có dòng:

```text
cluster_state:ok
```

Kiểm tra danh sách node:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster nodes"
```

Kiểm tra phân bổ slot:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster slots"
```

## 7. Kiểm tra ghi đọc dữ liệu

Khi test với Valkey Cluster, cần dùng option `-c` để `valkey-cli` tự đi theo redirect giữa các node.

Ghi dữ liệu:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -c -a \"$VALKEY_PASSWORD\" set cluster_test ok"
```

Đọc dữ liệu:

```bash
kubectl -n valkey-cluster exec valkey-cluster-1 -- sh -c \
  "valkey-cli -c -a \"$VALKEY_PASSWORD\" get cluster_test"
```

Kết quả mong đợi:

```text
ok
```

Kiểm tra key thuộc slot nào:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster keyslot cluster_test"
```

## 8. Kiểm tra failover

Xem master và replica hiện tại:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster nodes"
```

Chọn một pod đang là master rồi xóa pod đó để giả lập sự cố. Ví dụ:

```bash
kubectl -n valkey-cluster delete pod valkey-cluster-0
```

Theo dõi pod được tạo lại:

```bash
kubectl -n valkey-cluster get pods -w
```

Kiểm tra lại trạng thái cluster:

```bash
kubectl -n valkey-cluster exec valkey-cluster-1 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster info"
```

Kết quả mong đợi:

```text
cluster_state:ok
```

Kiểm tra node nào đang là master:

```bash
kubectl -n valkey-cluster exec valkey-cluster-1 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster nodes"
```

Lưu ý: Sau failover, replica của master bị lỗi sẽ được promote thành master. Pod cũ khi quay lại có thể trở thành replica.

## 9. Cấu hình ứng dụng kết nối

Ứng dụng phải dùng client hỗ trợ Valkey/Redis Cluster.

Endpoint nội bộ có thể dùng:

```text
valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
valkey-cluster-1.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
valkey-cluster-2.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
valkey-cluster-3.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
valkey-cluster-4.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
valkey-cluster-5.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
```

Thông tin cấu hình dạng khái niệm:

```text
cluster_enabled=true
startup_nodes=valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379,valkey-cluster-1.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379,valkey-cluster-2.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
password=<password trong secret valkey-cluster-auth>
```

Không dùng connection string kiểu single-node nếu ứng dụng cần ghi đọc trên toàn bộ cluster. Client phải hiểu hash slot và redirect.

## 10. Vận hành cơ bản

Xem log một pod:

```bash
kubectl -n valkey-cluster logs valkey-cluster-0
```

Xem trạng thái StatefulSet:

```bash
kubectl -n valkey-cluster get statefulset valkey-cluster
```

Restart toàn bộ StatefulSet:

```bash
kubectl -n valkey-cluster rollout restart statefulset valkey-cluster
```

Kiểm tra cấu hình cluster trong một pod:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "cat /data/valkey.conf"
```

Kiểm tra file node cluster:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "cat /data/nodes.conf"
```

## 11. Mở rộng cluster

Để mở rộng Valkey Cluster, không chỉ scale StatefulSet là đủ. Cần thêm node rồi dùng lệnh cluster để gán slot hoặc thêm replica.

Ví dụ scale StatefulSet lên 8 pod:

```bash
kubectl -n valkey-cluster scale statefulset valkey-cluster --replicas=8
```

Sau đó cần dùng các lệnh như:

```bash
valkey-cli --cluster add-node ...
valkey-cli --cluster reshard ...
```

Khuyến nghị: Trước khi mở rộng production, cần có kế hoạch reshard, kiểm tra backup và test trên môi trường staging.

## 12. Gỡ cài đặt

Xóa workload:

```bash
kubectl delete -f valkey/cluster/statefulset.yaml
kubectl delete -f valkey/cluster/service-headless.yaml
kubectl delete -f valkey/cluster/configmap.yaml
```

Xóa secret:

```bash
kubectl -n valkey-cluster delete secret valkey-cluster-auth
```

PVC của StatefulSet thường không bị xóa tự động. Nếu chắc chắn không cần dữ liệu nữa, xóa PVC:

```bash
kubectl -n valkey-cluster delete pvc \
  data-valkey-cluster-0 \
  data-valkey-cluster-1 \
  data-valkey-cluster-2 \
  data-valkey-cluster-3 \
  data-valkey-cluster-4 \
  data-valkey-cluster-5
```

Xóa namespace:

```bash
kubectl delete -f valkey/cluster/namespace.yaml
```

## 13. Lưu ý quan trọng

- Valkey Cluster cần tối thiểu 3 master để phân bổ đủ `16384` hash slot.
- Với `--cluster-replicas 1`, cần tổng cộng 6 node để có 3 master và 3 replica.
- Cần mở cả port `6379` và `16379` giữa các pod trong cluster.
- Không dùng Sentinel cho mô hình này.
- Không expose Valkey Cluster trực tiếp ra Internet.
- Nếu dùng NetworkPolicy, cần cho phép traffic giữa các pod `app=valkey-cluster`.
- Backup cần bao gồm dữ liệu trên tất cả PVC, không chỉ một pod.
