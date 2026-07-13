# Hướng Dẫn Cài Đặt Valkey Sentinel HA Trên Kubernetes

Tài liệu này hướng dẫn triển khai Valkey theo mô hình Sentinel HA trên Kubernetes. Phần manifest được tách thành các file YAML riêng trong thư mục này, README chỉ mô tả cách cài đặt, kiểm tra, kết nối và vận hành.

## 1. Mô Hình Triển Khai

Cụm gồm:

```text
3 pod Valkey:
  valkey-0
  valkey-1
  valkey-2

3 pod Sentinel:
  valkey-sentinel-0
  valkey-sentinel-1
  valkey-sentinel-2
```

Ban đầu `valkey-0` là primary, `valkey-1` và `valkey-2` là replica. Sentinel giám sát primary với tên `mymaster`. Khi primary lỗi và đủ quorum, Sentinel sẽ promote một replica thành primary mới.

Ứng dụng không nên kết nối cố định vào `valkey-0`. Ứng dụng nên dùng client hỗ trợ Sentinel để hỏi primary hiện tại.

Thông số chính:

| Thành phần | Giá trị |
| --- | --- |
| Namespace | `valkey` |
| Valkey port | `6379` |
| Sentinel port | `26379` |
| Sentinel master name | `mymaster` |
| Image | `valkey/valkey:9.1.0` |
| Secret password | `valkey-auth`, key `password` |
| StorageClass Valkey | `longhorn` |
| PVC mỗi pod Valkey | `5Gi` |
| PVC mỗi pod Sentinel | `1Gi` |

## 2. Các Manifest Sử Dụng

| File | Vai trò |
| --- | --- |
| `configmap.yaml` | Chứa script khởi động Valkey và Sentinel. |
| `service.yaml` | Tạo headless Service cho Valkey, Service cho Sentinel và headless Service cho Sentinel. |
| `statefulset.yaml` | Chạy 3 pod Valkey, trong đó `valkey-0` là primary ban đầu. |
| `sentinel.yaml` | Chạy 3 pod Sentinel để giám sát và failover. |

Nếu cluster không dùng StorageClass `longhorn`, sửa `storageClassName` trong `statefulset.yaml` trước khi apply.

## 3. Điều Kiện Trước Khi Cài Đặt

Cần có:

- Kubernetes cluster đã sẵn sàng.
- `kubectl` đang trỏ đúng context.
- Quyền tạo namespace, secret, configmap, service, statefulset và PVC.
- Ứng dụng/backend dùng client có hỗ trợ Redis/Valkey Sentinel.

Kiểm tra StorageClass:

```bash
kubectl get storageclass
```

## 4. Tạo Namespace Và Password

Tạo namespace:

```bash
kubectl create namespace valkey
```

Tạo Secret chứa password:

```bash
kubectl -n valkey create secret generic valkey-auth \
  --from-literal=password='CHANGE_ME_STRONG_PASSWORD'
```

Lấy password khi cần test:

```bash
VALKEY_PASSWORD="$(kubectl -n valkey get secret valkey-auth -o jsonpath='{.data.password}' | base64 -d)"
```

## 5. Apply Manifest

Chạy từ thư mục gốc repo:

```bash
kubectl apply -f valkey/sentinel/configmap.yaml
kubectl apply -f valkey/sentinel/service.yaml
kubectl apply -f valkey/sentinel/statefulset.yaml
kubectl apply -f valkey/sentinel/sentinel.yaml
```

Đợi pod sẵn sàng:

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

Kiểm tra Service và PVC:

```bash
kubectl -n valkey get svc
kubectl -n valkey get pvc
```

## 6. Kiểm Tra Replication

Lấy password:

```bash
VALKEY_PASSWORD="$(kubectl -n valkey get secret valkey-auth -o jsonpath='{.data.password}' | base64 -d)"
```

Kiểm tra role của từng pod:

```bash
for pod in valkey-0 valkey-1 valkey-2; do
  echo "== $pod =="
  kubectl -n valkey exec "$pod" -- sh -c \
    "valkey-cli -a \"$VALKEY_PASSWORD\" info replication | grep -E 'role|master_host|connected_slaves'"
done
```

Ghi dữ liệu vào primary ban đầu:

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

## 7. Kiểm Tra Sentinel

Hỏi primary hiện tại:

```bash
kubectl -n valkey exec valkey-sentinel-0 -- sh -c \
  "valkey-cli -p 26379 sentinel get-master-addr-by-name mymaster"
```

Kết quả ban đầu thường là:

```text
valkey-0.valkey-headless.valkey.svc.cluster.local
6379
```

Xem replica Sentinel đang biết:

```bash
kubectl -n valkey exec valkey-sentinel-0 -- sh -c \
  "valkey-cli -p 26379 sentinel replicas mymaster"
```

Xem các Sentinel khác:

```bash
kubectl -n valkey exec valkey-sentinel-0 -- sh -c \
  "valkey-cli -p 26379 sentinel sentinels mymaster"
```

## 8. Cách Ứng Dụng Kết Nối

Ứng dụng nên kết nối qua Sentinel, không kết nối cố định vào `valkey-0`.

Thông tin kết nối trong Kubernetes:

```text
Sentinel service: valkey-sentinel.valkey.svc.cluster.local
Sentinel port: 26379
Master name: mymaster
Valkey password: password trong Secret valkey-auth
```

Nếu client hỗ trợ nhiều Sentinel endpoint, dùng các DNS pod:

```text
valkey-sentinel-0.valkey-sentinel-headless.valkey.svc.cluster.local:26379
valkey-sentinel-1.valkey-sentinel-headless.valkey.svc.cluster.local:26379
valkey-sentinel-2.valkey-sentinel-headless.valkey.svc.cluster.local:26379
```

Ví dụ Node.js `ioredis`:

```js
const Redis = require("ioredis");

const redis = new Redis({
  sentinels: [
    { host: "valkey-sentinel.valkey.svc.cluster.local", port: 26379 },
  ],
  name: "mymaster",
  password: process.env.VALKEY_PASSWORD,
});
```

Client Sentinel sẽ hỏi Sentinel để lấy primary hiện tại. Sau failover, client sẽ reconnect sang primary mới.

## 9. Kiểm Tra Failover

Xem primary hiện tại:

```bash
kubectl -n valkey exec valkey-sentinel-0 -- sh -c \
  "valkey-cli -p 26379 sentinel get-master-addr-by-name mymaster"
```

Xóa primary hiện tại để giả lập lỗi. Nếu primary đang là `valkey-0`:

```bash
kubectl -n valkey delete pod valkey-0
```

Theo dõi log Sentinel:

```bash
kubectl -n valkey logs -f valkey-sentinel-0
```

Sau vài giây đến vài chục giây, Sentinel sẽ promote một replica thành primary mới. Kiểm tra lại:

```bash
kubectl -n valkey exec valkey-sentinel-0 -- sh -c \
  "valkey-cli -p 26379 sentinel get-master-addr-by-name mymaster"
```

Kiểm tra role:

```bash
for pod in valkey-0 valkey-1 valkey-2; do
  echo "== $pod =="
  kubectl -n valkey exec "$pod" -- sh -c \
    "valkey-cli -a \"$VALKEY_PASSWORD\" info replication | grep -E 'role|master_host|connected_slaves'" || true
done
```

Sau failover, `valkey-0` có thể quay lại với vai trò replica. Đây là hành vi bình thường; primary cũ không tự động giành lại quyền primary.

## 10. Vận Hành Cơ Bản

Xem log Valkey:

```bash
kubectl -n valkey logs valkey-0
```

Xem log Sentinel:

```bash
kubectl -n valkey logs valkey-sentinel-0
```

Restart Valkey:

```bash
kubectl -n valkey rollout restart statefulset valkey
```

Restart Sentinel:

```bash
kubectl -n valkey rollout restart statefulset valkey-sentinel
```

Nếu đổi password trong Secret, cần restart cả Valkey và Sentinel để đọc lại Secret.

## 11. Gỡ Cài Đặt

Xóa workload:

```bash
kubectl delete -f valkey/sentinel/sentinel.yaml
kubectl delete -f valkey/sentinel/statefulset.yaml
kubectl delete -f valkey/sentinel/service.yaml
kubectl delete -f valkey/sentinel/configmap.yaml
kubectl -n valkey delete secret valkey-auth
```

PVC không bị xóa tự động. Chỉ xóa khi chắc chắn không cần dữ liệu:

```bash
kubectl -n valkey delete pvc data-valkey-0 data-valkey-1 data-valkey-2
kubectl -n valkey delete pvc sentinel-data-valkey-sentinel-0 sentinel-data-valkey-sentinel-1 sentinel-data-valkey-sentinel-2
```

Xóa namespace:

```bash
kubectl delete namespace valkey
```

## 12. Lưu Ý Quan Trọng

- Sentinel nên chạy số lượng lẻ, tối thiểu 3 instance.
- `sentinel monitor mymaster ... 2` nghĩa là cần ít nhất 2 Sentinel đồng ý primary lỗi trước khi failover.
- Sentinel chỉ HA cho một primary, không shard dữ liệu và không scale write ngang.
- Replication là asynchronous, nên vẫn có khả năng mất một phần write rất mới nếu primary chết trước khi replica nhận dữ liệu.
- Ứng dụng không nên connect cố định vào `valkey-0`; hãy dùng Sentinel client.
- Cần đảm bảo network không chặn port `6379` giữa Valkey và port `26379` giữa app với Sentinel.
- Không expose Valkey/Sentinel trực tiếp ra Internet.
