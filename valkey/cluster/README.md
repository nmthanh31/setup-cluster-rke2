# Hướng Dẫn Cài Đặt Valkey Cluster Trên Kubernetes

Tài liệu này hướng dẫn triển khai Valkey theo mô hình Cluster trên Kubernetes. Phần manifest được tách thành các file YAML riêng trong thư mục này, README chỉ mô tả cách cài đặt, kiểm tra, kết nối và vận hành.

Valkey Cluster phù hợp khi cần scale ngang. Dữ liệu được chia thành `16384` hash slot và phân bổ trên nhiều master. Ứng dụng bắt buộc phải dùng Redis/Valkey Cluster client, không dùng client single-node thông thường.

## 1. Mô Hình Triển Khai

Cụm gồm 6 pod Valkey chạy bằng StatefulSet:

```text
valkey-cluster-0
valkey-cluster-1
valkey-cluster-2
valkey-cluster-3
valkey-cluster-4
valkey-cluster-5
```

Sau khi khởi tạo bằng `--cluster-replicas 1`, cụm sẽ có:

```text
3 master  : nhận read/write cho các hash slot mà master đó giữ
3 replica : đồng bộ từ master, dùng cho failover và có thể đọc read-only nếu client hỗ trợ
```

Valkey Cluster không có một endpoint write duy nhất. Khi ứng dụng ghi một key, cluster client tính key đó thuộc hash slot nào, sau đó gửi request đến master đang giữ slot đó. Nếu topology thay đổi do failover, client sẽ nhận redirect `MOVED`/`ASK`, refresh lại slot mapping và gửi request sang master mới.

Thông số chính:

| Thành phần | Giá trị |
| --- | --- |
| Namespace | `valkey-cluster` |
| StatefulSet | `valkey-cluster` |
| Image | `valkey/valkey:9.1.0` |
| Client port | `6379` |
| Cluster bus port | `16379` |
| Secret password | `valkey-cluster-auth`, key `password` |
| StorageClass | `longhorn` |
| PVC mỗi pod | `2Gi` |

## 2. Các Manifest Sử Dụng

| File | Vai trò |
| --- | --- |
| `namespace.yaml` | Tạo namespace `valkey-cluster`. |
| `configmap.yaml` | Chứa script khởi động Valkey với `cluster-enabled yes`. |
| `service-headless.yaml` | Tạo headless Service để mỗi pod StatefulSet có DNS cố định. |
| `statefulset.yaml` | Chạy 6 pod Valkey và cấp PVC riêng cho từng pod. |
| `service-nodeport-dev.yaml` | Tùy chọn: expose từng pod qua NodePort cố định cho dev test từ ngoài cluster. |
| `test-client.yaml` | Tùy chọn: pod test nội bộ có sẵn `valkey-cli`. |

Nếu cluster không có StorageClass `longhorn`, sửa `storageClassName` trong `statefulset.yaml` trước khi apply.

## 3. Điều Kiện Trước Khi Cài Đặt

Cần có:

- Kubernetes cluster đã sẵn sàng.
- `kubectl` đang trỏ đúng context.
- Network nội bộ cho phép các pod Valkey giao tiếp qua port `6379` và `16379`.
- Ứng dụng/backend dùng client có hỗ trợ Redis Cluster hoặc Valkey Cluster.

Kiểm tra StorageClass:

```bash
kubectl get storageclass
```

## 4. Tạo Namespace Và Password

Apply namespace:

```bash
kubectl apply -f valkey/cluster/namespace.yaml
```

Tạo Secret chứa password:

```bash
kubectl -n valkey-cluster create secret generic valkey-cluster-auth \
  --from-literal=password='CHANGE_ME_STRONG_PASSWORD'
```

Lấy password khi cần test:

```bash
VALKEY_PASSWORD="$(kubectl -n valkey-cluster get secret valkey-cluster-auth -o jsonpath='{.data.password}' | base64 -d)"
```

## 5. Apply Manifest

Chạy từ thư mục gốc repo:

```bash
kubectl apply -f valkey/cluster/configmap.yaml
kubectl apply -f valkey/cluster/service-headless.yaml
kubectl apply -f valkey/cluster/statefulset.yaml
```

Đợi pod sẵn sàng:

```bash
kubectl -n valkey-cluster wait --for=condition=Ready pod \
  -l app=valkey-cluster \
  --timeout=300s
```

Kiểm tra:

```bash
kubectl -n valkey-cluster get pods -o wide
kubectl -n valkey-cluster get svc
kubectl -n valkey-cluster get pvc
```

## 6. Khởi Tạo Valkey Cluster Lần Đầu

Sau khi 6 pod Running, các pod mới chỉ chạy Valkey ở cluster mode. Cần tạo cluster và phân bổ slot một lần:

```bash
VALKEY_PASSWORD="$(kubectl -n valkey-cluster get secret valkey-cluster-auth -o jsonpath='{.data.password}' | base64 -d)"

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

Không chạy lại lệnh này trên cùng PVC đã có cluster. Nếu muốn dựng lại từ đầu, xóa StatefulSet và PVC cũ trước.

## 7. Kiểm Tra Cluster

Kiểm tra trạng thái:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster info"
```

Kết quả mong đợi:

```text
cluster_state:ok
```

Xem master, replica và slot:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster nodes"
```

Test ghi/đọc bằng cluster mode:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -c -a \"$VALKEY_PASSWORD\" set cluster_test ok"

kubectl -n valkey-cluster exec valkey-cluster-1 -- sh -c \
  "valkey-cli -c -a \"$VALKEY_PASSWORD\" get cluster_test"
```

Kết quả mong đợi:

```text
ok
```

## 8. Cách Ứng Dụng Kết Nối

Ứng dụng chạy trong Kubernetes nên dùng Cluster client và truyền một vài startup node:

```text
valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
valkey-cluster-1.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
valkey-cluster-2.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379
```

Có thể truyền cả 6 node. Startup node chỉ là cửa vào ban đầu để client hỏi topology. Ứng dụng không cần và không nên hardcode node nào là master.

Ví dụ Node.js với `ioredis` trong Kubernetes:

```js
const Redis = require("ioredis");

const redis = new Redis.Cluster(
  [
    { host: "valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local", port: 6379 },
    { host: "valkey-cluster-1.valkey-cluster-headless.valkey-cluster.svc.cluster.local", port: 6379 },
    { host: "valkey-cluster-2.valkey-cluster-headless.valkey-cluster.svc.cluster.local", port: 6379 },
  ],
  {
    redisOptions: {
      password: process.env.VALKEY_PASSWORD,
    },
  }
);
```

## 9. Dev Test Từ Ngoài Kubernetes

Valkey Cluster trả topology nội bộ của Kubernetes. Vì vậy GUI/app local nếu chỉ connect một NodePort có thể fail khi bị redirect sang DNS hoặc Pod IP nội bộ. Cách tốt nhất để test cluster là chạy client trong Kubernetes, hoặc dùng client local có NAT mapping.

Apply NodePort dev nếu cần test từ ngoài cluster:

```bash
kubectl apply -f valkey/cluster/service-nodeport-dev.yaml
```

Mapping mặc định:

| Pod | NodePort |
| --- | --- |
| `valkey-cluster-0` | `31000` |
| `valkey-cluster-1` | `31001` |
| `valkey-cluster-2` | `31002` |
| `valkey-cluster-3` | `31003` |
| `valkey-cluster-4` | `31004` |
| `valkey-cluster-5` | `31005` |

Lấy node IP:

```bash
kubectl get nodes -o wide
```

Ví dụ node IP là `172.23.0.46`, app local dùng startup nodes:

```text
172.23.0.46:31000
172.23.0.46:31001
172.23.0.46:31002
172.23.0.46:31003
172.23.0.46:31004
172.23.0.46:31005
```

Với `ioredis`, cần cấu hình `natMap` để map DNS nội bộ sang NodePort:

```js
const Redis = require("ioredis");
const nodeIp = "172.23.0.46";

const redis = new Redis.Cluster(
  [
    { host: nodeIp, port: 31000 },
    { host: nodeIp, port: 31001 },
    { host: nodeIp, port: 31002 },
    { host: nodeIp, port: 31003 },
    { host: nodeIp, port: 31004 },
    { host: nodeIp, port: 31005 },
  ],
  {
    redisOptions: {
      password: process.env.VALKEY_PASSWORD,
    },
    natMap: {
      "valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379": { host: nodeIp, port: 31000 },
      "valkey-cluster-1.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379": { host: nodeIp, port: 31001 },
      "valkey-cluster-2.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379": { host: nodeIp, port: 31002 },
      "valkey-cluster-3.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379": { host: nodeIp, port: 31003 },
      "valkey-cluster-4.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379": { host: nodeIp, port: 31004 },
      "valkey-cluster-5.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379": { host: nodeIp, port: 31005 },
    },
  }
);
```

NodePort chỉ nên dùng trong mạng nội bộ cho dev/test, không expose ra Internet.

## 10. Pod Test Nội Bộ

Nếu muốn test đúng cluster topology mà không cần cài CLI trên máy local:

```bash
kubectl apply -f valkey/cluster/test-client.yaml
kubectl -n valkey-cluster exec -it valkey-cluster-test-client -- sh
```

Trong pod test:

```sh
valkey-cli -c \
  -h valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local \
  -p 6379 \
  -a "$VALKEY_PASSWORD" \
  SET dev_test "hello_from_test_client"

valkey-cli -c \
  -h valkey-cluster-1.valkey-cluster-headless.valkey-cluster.svc.cluster.local \
  -p 6379 \
  -a "$VALKEY_PASSWORD" \
  GET dev_test
```

Xóa pod test khi xong:

```bash
kubectl delete -f valkey/cluster/test-client.yaml
```

## 11. Failover Hoạt Động Như Nào

Mỗi master có một replica. Khi master chết đủ lâu để cluster đánh dấu fail, replica của master đó sẽ được promote thành master mới và nhận các slot của master cũ.

Ví dụ nếu hiện tại:

```text
valkey-cluster-0 master, slot 0-5460
valkey-cluster-4 replica của valkey-cluster-0
```

Khi `valkey-cluster-0` failover thành công:

```text
valkey-cluster-4 thành master cho slot 0-5460
valkey-cluster-0 khi quay lại thường sẽ thành replica của valkey-cluster-4
```

Master cũ không tự động giành lại vai trò master. Đây là hành vi bình thường để cluster ổn định.

Test failover:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster nodes"

kubectl -n valkey-cluster delete pod valkey-cluster-0

kubectl -n valkey-cluster get pods -w

kubectl -n valkey-cluster exec valkey-cluster-1 -- sh -c \
  "valkey-cli -a \"$VALKEY_PASSWORD\" cluster nodes"
```

## 12. Vận Hành Cơ Bản

Xem log:

```bash
kubectl -n valkey-cluster logs valkey-cluster-0
```

Restart StatefulSet:

```bash
kubectl -n valkey-cluster rollout restart statefulset valkey-cluster
```

Xem cấu hình trong pod:

```bash
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c "cat /data/valkey.conf"
kubectl -n valkey-cluster exec valkey-cluster-0 -- sh -c "cat /data/nodes.conf"
```

Nếu đổi password trong Secret, cần restart StatefulSet để pod đọc lại Secret.

## 13. Gỡ Cài Đặt

Xóa workload:

```bash
kubectl delete -f valkey/cluster/statefulset.yaml
kubectl delete -f valkey/cluster/service-headless.yaml
kubectl delete -f valkey/cluster/configmap.yaml
kubectl -n valkey-cluster delete secret valkey-cluster-auth
```

PVC của StatefulSet không bị xóa tự động. Chỉ xóa khi chắc chắn không cần dữ liệu:

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
kubectl delete namespace valkey-cluster
```

## 14. Lưu Ý Quan Trọng

- Cần tối thiểu 3 master để Valkey Cluster phân phối đủ `16384` hash slot.
- Với `--cluster-replicas 1`, cần 6 node để có 3 master và 3 replica.
- Cần mở cả port `6379` và `16379` giữa các pod.
- Replication là asynchronous, nên vẫn có khả năng mất một phần write rất mới nếu master chết trước khi kịp replicate.
- Các lệnh multi-key chỉ an toàn khi key nằm cùng hash slot. Dùng hash tag nếu cần, ví dụ `user:{1001}:profile`, `user:{1001}:cart`.
- Không expose Valkey Cluster trực tiếp ra Internet.
