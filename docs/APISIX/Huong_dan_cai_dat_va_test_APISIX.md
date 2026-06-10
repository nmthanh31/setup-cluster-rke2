# Hướng dẫn cài đặt và sử dụng Apache APISIX

Tài liệu này hướng dẫn cài APISIX trên Kubernetes/RKE2 và thực hành bốn chức
năng quan trọng:

1. Configure Routes - cấu hình đường dẫn API.
2. Load Balancing - cân bằng tải giữa nhiều backend.
3. Key Authentication - xác thực bằng API key.
4. Rate Limiting - giới hạn số request.

Mỗi phần gồm: chức năng, cấu hình, cách test và kết quả mong đợi.

## 1. APISIX là gì?

Apache APISIX là API Gateway đặt giữa client và các dịch vụ backend.

```text
Client -> APISIX -> Backend service
```

Thay vì để client gọi trực tiếp từng backend, client chỉ gọi APISIX. APISIX sẽ:

- Chọn đúng backend dựa trên URL.
- Cân bằng tải giữa các backend.
- Kiểm tra API key.
- Giới hạn số request.
- Ghi access log.
- Thu thập metrics.
- Chuyển đổi URI, header và response.
- Quản lý TLS/HTTPS.

![Kiến trúc APISIX](/docs/APISIX/images/apisix.png)

### Các khái niệm cần biết

| Thành phần | Chức năng |
|---|---|
| Route | Quy định request nào được tiếp nhận và chuyển đi đâu |
| Upstream | Danh sách backend nhận request |
| Plugin | Bổ sung xác thực, rate limit, log hoặc thay đổi request |
| Consumer | Đại diện cho ứng dụng hoặc người dùng gọi API |
| Admin API | API dùng để tạo Route, Upstream, Consumer và Plugin |
| etcd | Nơi APISIX lưu cấu hình |

Luồng xử lý một request:

```text
Client
  -> APISIX tìm Route phù hợp
  -> APISIX chạy Plugin
  -> APISIX chọn backend trong Upstream
  -> Backend trả kết quả
  -> APISIX trả kết quả cho Client
```

## 2. Các cổng sử dụng

| Cổng | Chức năng | Có nên mở bên ngoài? |
|---:|---|---|
| 9080 | Gateway HTTP | Có |
| 9443 | Gateway HTTPS | Có |
| 9180 | Admin API | Không |
| 9090 | Control API | Không |
| 2379 | etcd | Không |

Trong tài liệu này:

- Gateway được mở bằng NodePort `30080`.
- Admin API chỉ truy cập bằng `kubectl port-forward`.

> Không mở Admin API `9180` bằng NodePort. Người có Admin key có thể thay đổi
> toàn bộ cấu hình APISIX.

## 3. Cài đặt APISIX

### 3.1 Điều kiện

- Kubernetes/RKE2 đang hoạt động.
- Có `kubectl`.
- Có Helm 3.
- Có StorageClass cho etcd.
- Máy dev truy cập được IP của Kubernetes node.

Kiểm tra:

```bash
kubectl get nodes -o wide
kubectl get storageclass
helm version
```

### 3.2 Tạo `values-apisix.yaml`

```yaml
image:
  repository: apache/apisix
  tag: 3.16.0-ubuntu

replicaCount: 2

timezone: Asia/Ho_Chi_Minh

service:
  type: NodePort
  externalTrafficPolicy: Cluster
  http:
    enabled: true
    servicePort: 80
    containerPort: 9080
    nodePort: 30080

apisix:
  enableServerTokens: false
  deployment:
    mode: traditional
    role: traditional
    role_traditional:
      config_provider: etcd
    admin:
      enabled: true
      type: ClusterIP
      credentials:
        admin: "THAY-BANG-ADMIN-KEY-MANH"
        viewer: "THAY-BANG-VIEWER-KEY-MANH"
      allow:
        ipList:
          - 127.0.0.1/24
          - 10.42.0.0/16

etcd:
  enabled: true
  replicaCount: 3
  persistence:
    enabled: true
    size: 8Gi
```

Kiểm tra values của đúng phiên bản chart trước khi cài:

```bash
helm repo add apisix https://charts.apiseven.com
helm repo update
helm show values apisix/apisix
```

### 3.3 Cài APISIX

```bash
kubectl create namespace apisix

helm upgrade --install apisix apisix/apisix \
  --namespace apisix \
  --values values-apisix.yaml \
  --wait \
  --timeout 10m
```

Kiểm tra:

```bash
kubectl -n apisix get pods
kubectl -n apisix get svc
```

Kết quả đúng:

- Pod APISIX và etcd là `Running`.
- Container là `Ready`.
- Gateway Service có NodePort `30080`.
- Admin Service là `ClusterIP`.

## 4. Chuẩn bị địa chỉ test

### 4.1 Lấy IP node

```bash
kubectl get nodes -o wide
```

Ví dụ dùng node IP `172.23.0.28`.

### 4.2 Khai báo biến Gateway

PowerShell:

```powershell
$env:APISIX_NODE_IP = "172.23.0.28"
$env:APISIX_NODE_PORT = "30080"
$env:APISIX_GATEWAY = "http://$env:APISIX_NODE_IP`:$env:APISIX_NODE_PORT"
```

Test kết nối:

```powershell
Test-NetConnection $env:APISIX_NODE_IP -Port $env:APISIX_NODE_PORT
curl.exe -i "$env:APISIX_GATEWAY/"
```

Nếu TCP thành công và HTTP trả `404`, Gateway đã hoạt động nhưng chưa có Route.

### 4.3 Mở Admin API

Xem tên Service:

```bash
kubectl -n apisix get svc
```

Mở port-forward và giữ terminal này chạy:

```bash
kubectl -n apisix port-forward svc/apisix-admin 9180:9180
```

Mở terminal PowerShell khác:

```powershell
$env:APISIX_ADMIN_URL = "http://127.0.0.1:9180/apisix/admin"
$env:APISIX_ADMIN_KEY = "THAY-BANG-ADMIN-KEY-MANH"
```

Test Admin API:

```powershell
curl.exe -i "$env:APISIX_ADMIN_URL/routes" `
  -H "X-API-KEY: $env:APISIX_ADMIN_KEY"
```

Kết quả đúng là HTTP `200`.

## 5. Tạo backend mẫu

Ta tạo hai backend để dùng chung cho tất cả bài test.

Tạo file `echo-backends.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo-v1
  namespace: apisix
spec:
  replicas: 1
  selector:
    matchLabels:
      app: echo
      version: v1
  template:
    metadata:
      labels:
        app: echo
        version: v1
    spec:
      containers:
        - name: echo
          image: hashicorp/http-echo:1.0
          args:
            - "-text=response-from-v1"
          ports:
            - containerPort: 5678
---
apiVersion: v1
kind: Service
metadata:
  name: echo-v1
  namespace: apisix
spec:
  selector:
    app: echo
    version: v1
  ports:
    - port: 5678
      targetPort: 5678
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo-v2
  namespace: apisix
spec:
  replicas: 1
  selector:
    matchLabels:
      app: echo
      version: v2
  template:
    metadata:
      labels:
        app: echo
        version: v2
    spec:
      containers:
        - name: echo
          image: hashicorp/http-echo:1.0
          args:
            - "-text=response-from-v2"
          ports:
            - containerPort: 5678
---
apiVersion: v1
kind: Service
metadata:
  name: echo-v2
  namespace: apisix
spec:
  selector:
    app: echo
    version: v2
  ports:
    - port: 5678
      targetPort: 5678
```

Triển khai:

```bash
kubectl apply -f echo-backends.yaml
kubectl -n apisix get pods -l app=echo
kubectl -n apisix get svc echo-v1 echo-v2
```

Hai backend trả nội dung khác nhau:

- `echo-v1` trả `response-from-v1`.
- `echo-v2` trả `response-from-v2`.

## 6. Configure Routes

### Chức năng

Route quy định request nào được APISIX xử lý.

Ví dụ:

```text
GET /demo -> echo-v1
```

Route có thể kiểm tra:

- URI.
- HTTP method.
- Host.
- Header.
- Query parameter.

Nếu không có Route phù hợp, APISIX trả HTTP `404`.

### Cấu hình

Tạo Route `/demo` và trỏ trực tiếp tới backend `echo-v1`:

```powershell
$route = @'
{
  "name": "demo-route",
  "uri": "/demo",
  "methods": ["GET"],
  "upstream": {
    "type": "roundrobin",
    "nodes": {
      "echo-v1.apisix.svc.cluster.local:5678": 1
    }
  }
}
'@

curl.exe -i -X PUT "$env:APISIX_ADMIN_URL/routes/demo-route" `
  -H "X-API-KEY: $env:APISIX_ADMIN_KEY" `
  -H "Content-Type: application/json" `
  --data-raw $route
```

### Test

Test đúng URI và method:

```powershell
curl.exe -i "$env:APISIX_GATEWAY/demo"
```

Kết quả:

```text
HTTP/1.1 200 OK
response-from-v1
```

Test sai method:

```powershell
curl.exe -i -X POST "$env:APISIX_GATEWAY/demo"
```

Kết quả mong đợi: HTTP `404`.

### Kết luận

Route hoạt động khi `GET /demo` tới đúng backend, còn request không đúng điều
kiện bị từ chối.

## 7. Load Balancing

### Chức năng

Load Balancing phân phối request giữa nhiều backend. Mục đích:

- Tránh dồn toàn bộ tải vào một backend.
- Tăng khả năng chịu tải.
- Tiếp tục phục vụ khi một backend lỗi.
- Phân chia traffic theo trọng số.

APISIX hỗ trợ các thuật toán như:

- `roundrobin`: lần lượt chọn các backend.
- `chash`: chọn backend theo consistent hash.
- `least_conn`: ưu tiên backend có ít connection hơn.

Trong bài test này, `echo-v1` và `echo-v2` có cùng trọng số `1`, nên traffic được
chia gần bằng nhau.

### Cấu hình

Cập nhật Route `/demo` với hai backend:

```powershell
$routeLoadBalancing = @'
{
  "name": "demo-route",
  "uri": "/demo",
  "methods": ["GET"],
  "upstream": {
    "type": "roundrobin",
    "nodes": {
      "echo-v1.apisix.svc.cluster.local:5678": 1,
      "echo-v2.apisix.svc.cluster.local:5678": 1
    }
  }
}
'@

curl.exe -i -X PUT "$env:APISIX_ADMIN_URL/routes/demo-route" `
  -H "X-API-KEY: $env:APISIX_ADMIN_KEY" `
  -H "Content-Type: application/json" `
  --data-raw $routeLoadBalancing
```

### Test

Gửi nhiều request:

```powershell
1..10 | ForEach-Object {
  curl.exe -s "$env:APISIX_GATEWAY/demo"
}
```

Kết quả sẽ xen kẽ:

```text
response-from-v1
response-from-v2
response-from-v1
response-from-v2
```

Thứ tự thực tế có thể khác, nhưng phải thấy response từ cả `v1` và `v2`.

### Test backend lỗi

Tạm dừng backend `v2`:

```bash
kubectl -n apisix scale deployment echo-v2 --replicas=0
```

Gửi lại request:

```powershell
1..5 | ForEach-Object {
  curl.exe -i "$env:APISIX_GATEWAY/demo"
}
```

Nếu chưa cấu hình health check, một số request có thể lỗi khi APISIX chọn
backend `v2`. Trong production nên bật active health check để APISIX loại backend
không hoạt động.

Khôi phục:

```bash
kubectl -n apisix scale deployment echo-v2 --replicas=1
```

### Kết luận

Load Balancing hoạt động khi request được phân phối tới cả hai backend.

## 8. Key Authentication

### Chức năng

Plugin `key-auth` yêu cầu client gửi API key hợp lệ.

```text
Không có API key -> APISIX trả 401
API key sai       -> APISIX trả 401
API key đúng      -> APISIX gọi backend
```

Consumer đại diện cho ứng dụng hoặc người dùng gọi API. Mỗi Consumer có thể có
API key và chính sách riêng.

Phân biệt hai loại key:

| Key | Dùng ở đâu? |
|---|---|
| Admin key | Gọi Admin API để cấu hình APISIX |
| Consumer API key | Gọi API nghiệp vụ qua Gateway |

Không dùng Admin key làm Consumer API key.

### Cấu hình Consumer

Tạo Consumer `dev-client`:

```powershell
$consumer = @'
{
  "username": "dev-client",
  "plugins": {
    "key-auth": {
      "key": "dev-secret-key"
    }
  }
}
'@

curl.exe -i -X PUT "$env:APISIX_ADMIN_URL/consumers" `
  -H "X-API-KEY: $env:APISIX_ADMIN_KEY" `
  -H "Content-Type: application/json" `
  --data-raw $consumer
```

### Bật Key Authentication trên Route

```powershell
$routeKeyAuth = @'
{
  "name": "demo-route",
  "uri": "/demo",
  "methods": ["GET"],
  "plugins": {
    "key-auth": {}
  },
  "upstream": {
    "type": "roundrobin",
    "nodes": {
      "echo-v1.apisix.svc.cluster.local:5678": 1,
      "echo-v2.apisix.svc.cluster.local:5678": 1
    }
  }
}
'@

curl.exe -i -X PUT "$env:APISIX_ADMIN_URL/routes/demo-route" `
  -H "X-API-KEY: $env:APISIX_ADMIN_KEY" `
  -H "Content-Type: application/json" `
  --data-raw $routeKeyAuth
```

### Test không có API key

```powershell
curl.exe -i "$env:APISIX_GATEWAY/demo"
```

Kết quả mong đợi: HTTP `401`.

### Test API key sai

```powershell
curl.exe -i "$env:APISIX_GATEWAY/demo" `
  -H "apikey: wrong-key"
```

Kết quả mong đợi: HTTP `401`.

### Test API key đúng

```powershell
curl.exe -i "$env:APISIX_GATEWAY/demo" `
  -H "apikey: dev-secret-key"
```

Kết quả mong đợi: HTTP `200` và response từ `v1` hoặc `v2`.

### Kết luận

Key Authentication hoạt động khi APISIX chặn request thiếu/sai key và chỉ cho
request có key đúng đi tới backend.

## 9. Rate Limiting

### Chức năng

Rate Limiting giới hạn số request mà một client được gửi trong một khoảng thời
gian.

Ví dụ:

```text
Tối đa 5 request trong 60 giây cho mỗi IP
Request thứ 6 trở đi -> HTTP 429 Too Many Requests
```

Mục đích:

- Bảo vệ backend khi có quá nhiều request.
- Hạn chế lạm dụng API.
- Chống một phần các đợt traffic bất thường.
- Áp dụng quota theo IP, Consumer hoặc khóa tùy chỉnh.

Trong ví dụ này:

| Cấu hình | Ý nghĩa |
|---|---|
| `count: 5` | Cho phép 5 request |
| `time_window: 60` | Trong 60 giây |
| `key: remote_addr` | Mỗi IP có bộ đếm riêng |
| `rejected_code: 429` | Mã trả về khi vượt giới hạn |
| `policy: local` | Bộ đếm nằm trên từng APISIX Pod |

### Cấu hình

Route tiếp tục giữ Key Authentication và thêm Rate Limiting:

```powershell
$routeRateLimit = @'
{
  "name": "demo-route",
  "uri": "/demo",
  "methods": ["GET"],
  "plugins": {
    "key-auth": {},
    "limit-count": {
      "count": 5,
      "time_window": 60,
      "rejected_code": 429,
      "key_type": "var",
      "key": "remote_addr",
      "policy": "local"
    }
  },
  "upstream": {
    "type": "roundrobin",
    "nodes": {
      "echo-v1.apisix.svc.cluster.local:5678": 1,
      "echo-v2.apisix.svc.cluster.local:5678": 1
    }
  }
}
'@

curl.exe -i -X PUT "$env:APISIX_ADMIN_URL/routes/demo-route" `
  -H "X-API-KEY: $env:APISIX_ADMIN_KEY" `
  -H "Content-Type: application/json" `
  --data-raw $routeRateLimit
```

### Test

Gửi 7 request có API key:

```powershell
1..7 | ForEach-Object {
  curl.exe -s -o NUL `
    -w "request=$($_) status=%{http_code}`n" `
    "$env:APISIX_GATEWAY/demo" `
    -H "apikey: dev-secret-key"
}
```

Kết quả mong đợi:

```text
request=1 status=200
request=2 status=200
request=3 status=200
request=4 status=200
request=5 status=200
request=6 status=429
request=7 status=429
```

Chờ 60 giây rồi test lại, bộ đếm sẽ được mở lại.

### Lưu ý

`policy: local` lưu bộ đếm riêng trên từng APISIX Pod. Khi APISIX có nhiều
replica, tổng số request toàn hệ thống có thể lớn hơn `5`. Production cần chọn
policy lưu trữ dùng chung nếu muốn giới hạn chính xác trên toàn cụm.

### Kết luận

Rate Limiting hoạt động khi năm request đầu thành công và request vượt giới hạn
nhận HTTP `429`.

## 10. Các chức năng APISIX khác

Bốn chức năng trên là luồng sử dụng cơ bản. APISIX còn hỗ trợ:

| Chức năng | Plugin hoặc tài nguyên thường dùng | Mục đích |
|---|---|---|
| JWT Authentication | `jwt-auth` | Xác thực bằng JWT |
| OpenID Connect | `openid-connect` | Tích hợp Keycloak hoặc IdP |
| Basic Authentication | `basic-auth` | Xác thực username/password |
| IP restriction | `ip-restriction` | Cho phép hoặc chặn IP |
| CORS | `cors` | Quản lý truy cập từ trình duyệt |
| URI/header rewrite | `proxy-rewrite` | Đổi URI và header trước khi gọi backend |
| Response rewrite | `response-rewrite` | Đổi status, header hoặc body trả về |
| Request limit | `limit-req` | Giới hạn tốc độ request |
| Connection limit | `limit-conn` | Giới hạn connection đồng thời |
| Circuit breaker | `api-breaker` | Tạm ngắt backend đang lỗi |
| Prometheus metrics | `prometheus` | Xuất metrics để giám sát |
| Distributed tracing | `opentelemetry` | Theo dõi request qua nhiều dịch vụ |
| Access logging | Logger plugins | Gửi log tới hệ thống tập trung |
| TLS/HTTPS | SSL resource | Quản lý certificate theo domain |
| Canary release | `traffic-split` | Chia traffic giữa phiên bản cũ và mới |

Chỉ bật các plugin thực sự cần thiết. Mỗi plugin đều làm tăng độ phức tạp của
cấu hình và có thể ảnh hưởng hiệu năng.

## 11. Kiểm tra tổng hợp

| Bài test | Kết quả đúng |
|---|---|
| TCP tới NodePort | `TcpTestSucceeded = True` |
| `GET /demo` sau khi tạo Route | HTTP 200 |
| `POST /demo` | HTTP 404 |
| Gửi nhiều request khi cân bằng tải | Có response từ cả v1 và v2 |
| Không có API key | HTTP 401 |
| API key sai | HTTP 401 |
| API key đúng | HTTP 200 |
| Vượt giới hạn request | HTTP 429 |

Các mã lỗi cần nhớ:

| Mã | Ý nghĩa thường gặp |
|---:|---|
| 200 | Request thành công |
| 401 | Thiếu hoặc sai thông tin xác thực |
| 403 | Có xác thực nhưng không được phép |
| 404 | Không có Route phù hợp |
| 429 | Vượt giới hạn request |
| 502 | APISIX không nhận được response hợp lệ từ backend |
| 503 | Backend không sẵn sàng |

## 12. Kiểm tra log

Xem Pod và label:

```bash
kubectl -n apisix get pods --show-labels
```

Xem log:

```bash
kubectl -n apisix logs \
  -l app.kubernetes.io/name=apisix \
  --tail=100 \
  --prefix
```

Access log cho biết:

- Client IP.
- URI và method.
- HTTP status.
- Backend được gọi.
- Thời gian xử lý.

Error log dùng để tìm lỗi DNS, timeout, plugin và kết nối upstream.

## 13. Lỗi thường gặp

### NodePort timeout

Kiểm tra:

```bash
kubectl get nodes -o wide
kubectl -n apisix get svc
```

```powershell
Test-NetConnection <NODE-IP> -Port 30080
```

Nguyên nhân thường là sai node IP, firewall chặn hoặc máy dev không có route tới
mạng Kubernetes.

### HTTP 404

Kiểm tra URI và method của Route:

```powershell
curl.exe -s "$env:APISIX_ADMIN_URL/routes/demo-route" `
  -H "X-API-KEY: $env:APISIX_ADMIN_KEY"
```

### HTTP 502 hoặc 503

Kiểm tra backend:

```bash
kubectl -n apisix get pods -l app=echo
kubectl -n apisix get svc echo-v1 echo-v2
kubectl -n apisix get endpointslices
```

### Admin API trả 401 hoặc 403

Kiểm tra:

- `X-API-KEY` có đúng không.
- Port-forward có đang chạy không.
- Có dùng đúng Service Admin không.
- IP Pod có nằm trong `allow.ipList` không.

## 14. Lưu ý khi dùng production

- Không public Admin API và etcd.
- Lưu Admin key bằng Kubernetes Secret.
- Bật TLS/HTTPS.
- Chạy nhiều APISIX replica trên các node khác nhau.
- Chạy etcd ba replica và sao lưu định kỳ.
- Cấu hình resource requests/limits.
- Cấu hình PodDisruptionBudget và autoscaling.
- Bật metrics, log tập trung và cảnh báo.
- Dùng NetworkPolicy.
- Pin phiên bản Helm chart và container image.
- Test nâng cấp trên UAT trước production.

## 15. Dọn môi trường test

Xóa Route:

```powershell
curl.exe -i -X DELETE "$env:APISIX_ADMIN_URL/routes/demo-route" `
  -H "X-API-KEY: $env:APISIX_ADMIN_KEY"
```

Xóa Consumer:

```powershell
curl.exe -i -X DELETE "$env:APISIX_ADMIN_URL/consumers/dev-client" `
  -H "X-API-KEY: $env:APISIX_ADMIN_KEY"
```

Xóa backend:

```bash
kubectl delete -f echo-backends.yaml
```

Gỡ APISIX:

```bash
helm uninstall apisix -n apisix
```

Kiểm tra PVC trước khi xóa namespace:

```bash
kubectl -n apisix get pvc
```

## 16. Tài liệu tham khảo

- [Apache APISIX - Installation](https://apisix.apache.org/docs/apisix/installation-guide/)
- [Apache APISIX - Admin API](https://apisix.apache.org/docs/apisix/admin-api/)
- [Apache APISIX - Plugins](https://apisix.apache.org/docs/apisix/plugins/)
- [Apache APISIX Helm Chart](https://github.com/apache/apisix-helm-chart)

