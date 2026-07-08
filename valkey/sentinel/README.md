# Hướng dẫn cài đặt Valkey Sentinel HA trên Kubernetes

Tài liệu này mô tả cách cài đặt cụm Valkey HA theo mô hình 1 primary, 2 replica và 3 Sentinel từ các manifest trong thư mục `valkey`.

## 1. Kiến trúc

Cụm gồm các thành phần sau:

| Thành phần | Manifest | Mô tả |
| --- | --- | --- |
| `valkey` StatefulSet | `statefulset.yaml` | Chạy 3 pod Valkey: `valkey-0`, `valkey-1`, `valkey-2`. Mặc định `valkey-0` là primary ban đầu, các pod còn lại là replica. |
| `valkey-sentinel` StatefulSet | `sentinel.yaml` | Chạy 3 pod Sentinel để giám sát primary và thực hiện failover tự động. |
| `valkey-headless` Service | `service.yaml` | Headless service cho các pod Valkey, dùng để tạo DNS ổn định cho StatefulSet. |
| `valkey-sentinel` Service | `service.yaml` | ClusterIP service cho ứng dụng kết nối tới Sentinel. |
| `valkey-sentinel-headless` Service | `service.yaml` | Headless service cho các pod Sentinel. |
| `valkey-scripts` ConfigMap | `configmap.yaml` | Chứa script khởi động Valkey và Sentinel. |
| `valkey-auth` Secret | Tạo bằng lệnh bên dưới | Chứa mật khẩu xác thực Valkey. |

Thông tin quan trọng:

- Namespace: `valkey`
- Valkey port: `6379`
- Sentinel port: `26379`
- Sentinel master name: `mymaster`
- Image: `valkey/valkey:9.1.0`
- StorageClass cho data Valkey: `longhorn`

## 2. Điều kiện trước khi cài đặt

Cần có:

- Kubernetes cluster đã sẵn sàng.
- `kubectl` đã cấu hình đúng context.
- StorageClass `longhorn` tồn tại nếu giữ nguyên `statefulset.yaml`.
- Quyền tạo namespace, secret, configmap, service, statefulset và PVC.

Kiểm tra StorageClass:

```bash
kubectl get storageclass
```

Nếu cluster không có StorageClass `longhorn`, hãy sửa `storageClassName` trong `statefulset.yaml` sang StorageClass phù hợp trước khi apply.

## 3. Tạo namespace và secret

Tạo namespace:

```bash
kubectl create namespace valkey
```

Tạo secret chứa mật khẩu Valkey:

```bash
kubectl -n valkey create secret generic valkey-auth \
  --from-literal=password='CHANGE_ME_STRONG_PASSWORD'
```

Nếu secret đã tồn tại và muốn cập nhật mật khẩu:

```bash
kubectl -n valkey delete secret valkey-auth
kubectl -n valkey create secret generic valkey-auth \
  --from-literal=password='CHANGE_ME_STRONG_PASSWORD'
```

Lưu ý: Việc đổi mật khẩu sau khi cụm đã chạy cần restart các pod Valkey và Sentinel để đọc lại secret.

## 4. Apply manifest

Chạy từ thư mục gốc repo:

```bash
kubectl apply -f valkey/configmap.yaml
kubectl apply -f valkey/service.yaml
kubectl apply -f valkey/statefulset.yaml
kubectl apply -f valkey/sentinel.yaml
```

Theo dõi trạng thái pod:

```bash
kubectl -n valkey get pods -w
```

Kết quả mong đợi:

```text
valkey-0             1/1     Running
valkey-1             1/1     Running
valkey-2             1/1     Running
valkey-sentinel-0    1/1     Running
valkey-sentinel-1    1/1     Running
valkey-sentinel-2    1/1     Running
```

Kiểm tra service và PVC:

```bash
kubectl -n valkey get svc
kubectl -n valkey get pvc
```

## 5. Kiểm tra replication

Lấy mật khẩu từ secret:

```bash
VALKEY_PASSWORD="$(kubectl -n valkey get secret valkey-auth -o jsonpath='{.data.password}' | base64 -d)"
```

Kiểm tra role của từng node:

```bash
for pod in valkey-0 valkey-1 valkey-2; do
  echo "== $pod =="
  kubectl -n valkey exec "$pod" -- sh -c \
    "valkey-cli -a \"$VALKEY_PASSWORD\" info replication | grep -E 'role|master_host|connected_slaves'"
done
```

Trạng thái ban đầu thường là:

- `valkey-0`: `role:master`
- `valkey-1`, `valkey-2`: `role:slave` hoặc `role:replica`

Ghi thử dữ liệu vào primary:

```bash
kubectl -n valkey exec valkey-0 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" set ha_test ok"
```

Đọc từ replica:

```bash
kubectl -n valkey exec valkey-1 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" get ha_test"
```

Kết quả mong đợi:

```text
ok
```

## 6. Kiểm tra Sentinel

Kiểm tra Sentinel đang nhìn thấy primary nào:

```bash
kubectl -n valkey exec valkey-sentinel-0 -- sh -c \
  "valkey-cli -p 26379 sentinel get-master-addr-by-name mymaster"
```

Kết quả ban đầu thường trả về:

```text
valkey-0.valkey-headless.valkey.svc.cluster.local
6379
```

Kiểm tra danh sách replica Sentinel đang biết:

```bash
kubectl -n valkey exec valkey-sentinel-0 -- sh -c \
  "valkey-cli -p 26379 sentinel replicas mymaster"
```

Kiểm tra danh sách Sentinel:

```bash
kubectl -n valkey exec valkey-sentinel-0 -- sh -c \
  "valkey-cli -p 26379 sentinel sentinels mymaster"
```

## 7. Kiểm tra failover

Xóa pod primary hiện tại để giả lập sự cố:

```bash
kubectl -n valkey delete pod valkey-0
```

Theo dõi log Sentinel:

```bash
kubectl -n valkey logs -f valkey-sentinel-0
```

Sau vài giây đến vài chục giây, Sentinel sẽ bầu một replica thành primary mới. Kiểm tra lại:

```bash
kubectl -n valkey exec valkey-sentinel-0 -- sh -c \
  "valkey-cli -p 26379 sentinel get-master-addr-by-name mymaster"
```

Kiểm tra role của các Valkey pod:

```bash
for pod in valkey-0 valkey-1 valkey-2; do
  echo "== $pod =="
  kubectl -n valkey exec "$pod" -- sh -c \
    "valkey-cli -a \"$VALKEY_PASSWORD\" info replication | grep -E 'role|master_host|connected_slaves'" || true
done
```

Lưu ý: Sau failover, `valkey-0` có thể quay lại với vai trò replica thay vì primary. Ứng dụng không nên kết nối cố định vào `valkey-0`; ứng dụng nên hỏi Sentinel để lấy primary hiện tại.

## 8. Cấu hình ứng dụng kết nối

Ứng dụng nên kết nối Sentinel thay vì kết nối trực tiếp vào từng pod Valkey.

Thông tin kết nối Sentinel trong cluster:

- Sentinel service: `valkey-sentinel.valkey.svc.cluster.local`
- Sentinel port: `26379`
- Master name: `mymaster`
- Password: giá trị trong secret `valkey-auth`

Ví dụ cấu hình dạng khái niệm:

```text
sentinel_hosts=valkey-sentinel.valkey.svc.cluster.local:26379
sentinel_master_name=mymaster
password=<password trong secret valkey-auth>
```

Nếu thư viện client hỗ trợ nhiều Sentinel endpoint, có thể dùng các DNS pod ổn định:

```text
valkey-sentinel-0.valkey-sentinel-headless.valkey.svc.cluster.local:26379
valkey-sentinel-1.valkey-sentinel-headless.valkey.svc.cluster.local:26379
valkey-sentinel-2.valkey-sentinel-headless.valkey.svc.cluster.local:26379
```

## 9. Vận hành cơ bản

Xem log Valkey:

```bash
kubectl -n valkey logs valkey-0
```

Xem log Sentinel:

```bash
kubectl -n valkey logs valkey-sentinel-0
```

Scale lại StatefulSet Valkey:

```bash
kubectl -n valkey scale statefulset valkey --replicas=3
```

Scale lại StatefulSet Sentinel:

```bash
kubectl -n valkey scale statefulset valkey-sentinel --replicas=3
```

Restart Valkey:

```bash
kubectl -n valkey rollout restart statefulset valkey
```

Restart Sentinel:

```bash
kubectl -n valkey rollout restart statefulset valkey-sentinel
```

## 10. Gỡ cài đặt

Nếu muốn xóa toàn bộ cụm Valkey:

```bash
kubectl delete -f valkey/sentinel.yaml
kubectl delete -f valkey/statefulset.yaml
kubectl delete -f valkey/service.yaml
kubectl delete -f valkey/configmap.yaml
kubectl -n valkey delete secret valkey-auth
```

PVC của StatefulSet thường không bị xóa tự động. Nếu chắc chắn không cần dữ liệu nữa, xóa PVC:

```bash
kubectl -n valkey delete pvc data-valkey-0 data-valkey-1 data-valkey-2
kubectl -n valkey delete pvc sentinel-data-valkey-sentinel-0 sentinel-data-valkey-sentinel-1 sentinel-data-valkey-sentinel-2
```

Sau cùng có thể xóa namespace:

```bash
kubectl delete namespace valkey
```

## 11. Lưu ý quan trọng

- Sentinel cần số lượng lẻ, tối thiểu 3 instance để đạt quorum tốt hơn.
- `sentinel monitor mymaster ... 2` nghĩa là cần ít nhất 2 Sentinel đồng ý primary bị lỗi trước khi failover.
- Không kết nối ứng dụng trực tiếp vào `valkey-0` trong môi trường HA, vì primary có thể thay đổi sau failover.
- Cần đảm bảo network policy, firewall nội bộ hoặc service mesh không chặn port `6379` và `26379`.
- Nếu dùng ngoài cluster, nên tạo service/ingress riêng theo chuẩn bảo mật nội bộ và không expose Valkey công khai ra Internet.
