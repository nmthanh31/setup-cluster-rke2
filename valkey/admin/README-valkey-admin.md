# Cài Valkey Admin trên cụm `local`

Manifest này triển khai Valkey Admin 1.0.1 ở chế độ Web trong namespace
`valkey-cluster`. Password được đọc trực tiếp từ Secret
`valkey-cluster-auth`; manifest không chứa giá trị password.

## 1. Kiểm tra trước khi cài

```powershell
kubectl config current-context
kubectl -n valkey-cluster get pods
kubectl -n valkey-cluster get secret valkey-cluster-auth
```

Context phải là `local` và sáu pod Valkey phải ở trạng thái `Running`.

## 2. Xem trước thay đổi

Chạy tại thư mục chứa file `valkey-admin.yaml`:

```powershell
kubectl diff -f .\valkey-admin.yaml
kubectl apply --dry-run=server -f .\valkey-admin.yaml
```

`kubectl diff` có thể trả exit code 1 khi có khác biệt; đó không phải lỗi cài đặt.

## 3. Cài đặt

```powershell
kubectl apply -f .\valkey-admin.yaml
kubectl -n valkey-cluster rollout status deployment/valkey-admin --timeout=5m
kubectl -n valkey-cluster get pod,service -l app.kubernetes.io/name=valkey-admin
```

## 4. Xem log và mở giao diện

```powershell
kubectl -n valkey-cluster logs deployment/valkey-admin --tail=100
kubectl -n valkey-cluster port-forward service/valkey-admin 8080:8080
```

Giữ cửa sổ PowerShell cuối mở, sau đó truy cập:

<http://localhost:8080>

Nếu trình duyệt yêu cầu tạo connection thủ công, dùng:

- Host: `valkey-cluster-0-nodeport.valkey-cluster.svc.cluster.local`
- Port: `6379`
- TLS: tắt
- Password: lấy theo quy trình quản lý bí mật của đơn vị; không in password ra
  terminal hoặc lưu trong trình duyệt dùng chung.

## 5. Chẩn đoán

```powershell
kubectl -n valkey-cluster describe pod -l app.kubernetes.io/name=valkey-admin
kubectl -n valkey-cluster logs deployment/valkey-admin --tail=200
kubectl -n valkey-cluster get endpoints valkey-admin
```

Nếu gặp `ImagePullBackOff`, kiểm tra đường ra tới `ghcr.io`, hoặc mirror image
`ghcr.io/valkey-io/valkey-admin:1.0.1` vào Harbor nội bộ rồi sửa trường `image`.

Nếu giao diện mở được nhưng không thấy topology, kiểm tra pod Valkey Admin có thể
truy cập IP các node `172.23.0.x` và NodePort `31000-31005`. Cluster hiện công bố
các địa chỉ này cho client.

## 6. Gỡ cài đặt

```powershell
kubectl delete -f .\valkey-admin.yaml
```

Lệnh trên chỉ xóa Deployment và Service của Valkey Admin, không xóa Valkey,
Secret hay dữ liệu Valkey.

## Trước khi tạo Ingress

Không đưa Service này lên Ingress công khai ngay. Cần đặt OAuth2/OIDC proxy kết
nối Keycloak ở phía trước, có TLS đáng tin cậy và giới hạn IP/VPN. Valkey Admin
có chức năng xem/sửa key và thực thi command nên không nên chỉ dựa vào URL bí mật.
