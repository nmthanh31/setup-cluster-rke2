# Giới thiệu và triển khai Hardware Management Service

## 1. Tổng quan

Hardware Management Service (HMS) là dịch vụ backend quản lý hạ tầng phần cứng và sơ đồ kết nối mạng. Dịch vụ được xây dựng bằng NestJS, sử dụng MongoDB để lưu trữ dữ liệu và cung cấp REST API cho các nghiệp vụ:

- Quản lý thiết bị phần cứng.
- Quản lý cổng giao tiếp của thiết bị.
- Quản lý liên kết vật lý hoặc logic giữa các cổng.
- Tổng hợp topology mạng.
- Quản lý cấu hình lưu trữ và báo cáo định kỳ.
- Kiểm tra trạng thái thiết bị theo lịch.

Swagger UI được tích hợp sẵn để tra cứu và thử nghiệm API.

## 2. Kiến trúc triển khai

![Flow access](/docs/HMS/image/flow_access_hms.png)

Các thành phần triển khai hiện có:

| Thành phần | Mục đích |
| --- | --- |
| NestJS 11 | Cung cấp REST API và các tác vụ định kỳ |
| MongoDB | Lưu thiết bị, cổng, liên kết, cấu hình, báo cáo và khóa |
| Docker | Đóng gói ứng dụng bằng multi-stage build |
| GitLab CI | Kiểm thử, build image và cập nhật manifest môi trường dev |
| Harbor | Lưu trữ Docker image |
| Fleet | Đồng bộ manifest trong `fleet/` lên Kubernetes |
| External Secrets Operator | Đồng bộ `MONGO_URI` từ GitLab vào Kubernetes Secret |
| NGINX Ingress | Công bố dịch vụ qua HTTPS |

## 3. Cấu hình ứng dụng

Ứng dụng đọc cấu hình từ biến môi trường:

| Biến | Bắt buộc | Mô tả | Giá trị sử dụng trong môi trường dev |
| --- | --- | --- | --- |
| `API_PORT` | Không | Cổng HTTP của ứng dụng | `3000` |
| `PORT` | Không | Cổng dự phòng nếu không có `API_PORT` | Không cấu hình |
| `MONGO_URI` | Có khi triển khai | Chuỗi kết nối MongoDB | Lấy từ Kubernetes Secret |
| `MONGO_DB` | Không | Tên database | `dev_db` |
| `APP_TZ` | Không | Múi giờ cho tiến trình và cron job | Theo nhu cầu môi trường |

Thứ tự chọn cổng là `API_PORT`, `PORT`, sau đó mặc định `3333`. Manifest Kubernetes hiện cấu hình `API_PORT=3000`.

Không ghi trực tiếp thông tin xác thực vào tài liệu, source code hoặc manifest được commit. Với môi trường Kubernetes, `MONGO_URI` phải được quản lý qua GitLab variable và External Secrets.

## 4. Endpoint vận hành

Khi chạy local với `API_PORT=3000`:

| Endpoint | Mục đích |
| --- | --- |
| `GET http://localhost:3000/api` | Health check |
| `http://localhost:3000/docs` | Swagger UI |
| `GET http://localhost:3000/api/topology` | Lấy topology hiện tại |
| `GET http://localhost:3000/api/devices` | Lấy danh sách thiết bị |
| `GET http://localhost:3000/api/settings` | Lấy cấu hình hệ thống |
| `GET http://localhost:3000/api/reports` | Lấy lịch sử báo cáo |

Health check thành công trả về:

```json
{
  "name": "Hardware Management Service",
  "status": "ok"
}
```

Trong môi trường dev hiện tại:

- Base URL: `https://dev-cmp-api.vnpost.vn/hms`
- Health check: `https://dev-cmp-api.vnpost.vn/hms/api`
- Swagger: `https://dev-cmp-api.vnpost.vn/hms/docs`

## 5. Chạy tại máy phát triển

### 5.1. Yêu cầu

- Node.js 22.
- Yarn.
- Docker và Docker Compose.
- Cổng `3000` và `27018` chưa được sử dụng.

### 5.2. Khởi động MongoDB

Từ thư mục gốc của dự án:

```bash
docker compose up -d
docker compose ps
```

MongoDB được công bố tại `localhost:27018`; dữ liệu được lưu trong thư mục `db_data/`.

### 5.3. Cấu hình môi trường

Tạo file `.env` cục bộ và không commit file này:

```env
APP_NAME=Hardware Management Service
API_PORT=3000
APP_TZ=Asia/Ho_Chi_Minh
MONGO_URI=<MONGODB_CONNECTION_STRING>
MONGO_DB=hms
```

### 5.4. Cài đặt và khởi chạy

```bash
yarn install --frozen-lockfile
yarn start:dev
```

Kiểm tra:

```bash
curl http://localhost:3000/api
```

### 5.5. Dừng môi trường local

```bash
docker compose down
```

Lệnh trên không xóa dữ liệu trong `db_data/`.

## 6. Triển khai bằng Docker

### 6.1. Build image

```bash
docker build -t hms-service:local .
```

### 6.2. Chạy container

```bash
docker run --rm \
  --name hms-service \
  -p 3000:3000 \
  -e API_PORT=3000 \
  -e APP_TZ=Asia/Ho_Chi_Minh \
  -e MONGO_DB=hms \
  -e MONGO_URI="<MONGODB_CONNECTION_STRING>" \
  hms-service:local
```

Nếu MongoDB chạy bằng Compose trên máy host, chuỗi kết nối từ container cần sử dụng `host.docker.internal` thay cho `localhost`.

### 6.3. Kiểm tra container

```bash
docker ps
docker logs hms-service
curl http://localhost:3000/api
```

Ứng dụng đồng thời ghi log vào `logs/app.log` bên trong container. Cấu hình Kubernetes hiện chưa gắn persistent volume cho thư mục này, vì vậy log file sẽ mất khi Pod bị thay thế; log chuẩn đầu ra vẫn có thể xem bằng `kubectl logs`.

## 7. Triển khai lên Kubernetes

Manifest môi trường dev nằm tại `fleet/dev/`, namespace mặc định được khai báo trong `fleet/fleet.yaml` là `cmp-hms-dev`.

### 7.1. Tài nguyên được tạo

| File | Tài nguyên |
| --- | --- |
| `configmap.yaml` | `ConfigMap/cmp-hms-config` |
| `gitlab-secret-token.example` | Mẫu Secret truy cập GitLab |
| `secret-store.yaml` | `SecretStore/gitlab-secret-store` |
| `external-secret.yaml` | `ExternalSecret/cmp-hms-secret` |
| `deployment.yaml` | `Deployment/cmp-hms` |
| `service.yaml` | `Service/cmp-hms` |
| `ingress.yaml` | `Ingress/cmp-hms` |

### 7.2. Chuẩn bị trước triển khai

1. Đảm bảo namespace `cmp-hms-dev` tồn tại.
2. Đảm bảo cluster đã cài Fleet, NGINX Ingress, cert-manager và External Secrets Operator.
3. Tạo GitLab CI/CD variable `MONGO_URI` cho environment `dev`.
4. Tạo Secret `gitlab-secret-token` từ mẫu `fleet/dev/gitlab-secret-token.example`.
5. Đảm bảo Secret kéo image `harbor-pull-secret` tồn tại trong namespace.
6. Đảm bảo DNS `dev-cmp-api.vnpost.vn` trỏ tới NGINX Ingress.
7. Đảm bảo certificate issuer `selfsigned-cluster-issuer` tồn tại.

Ví dụ tạo Secret truy cập GitLab mà không lưu token vào file:

```bash
kubectl -n cmp-hms-dev create secret generic gitlab-secret-token \
  --from-literal=token="<GITLAB_ACCESS_TOKEN_WITH_API_SCOPE>"
```

Không sử dụng các file Secret chứa token hoặc Docker credential đã commit trước đó. Cần thu hồi và xoay vòng mọi credential từng xuất hiện trong lịch sử Git.

### 7.3. Luồng triển khai tự động

Pipeline chỉ chạy trên nhánh `dev-cicd` khi các file được theo dõi trong `.gitlab-ci.yml` thay đổi:

1. Job `verify` cài dependency, chạy unit test và build ứng dụng.
2. Job `kaniko-build` build image từ `Dockerfile` và đẩy lên Harbor với tag là `CI_COMMIT_SHORT_SHA`.
3. Job `update-dev-manifest` cập nhật trường `image` trong `fleet/dev/deployment.yaml`.
4. Pipeline commit và push manifest đã cập nhật về nhánh `dev-cicd`.
5. Fleet phát hiện thay đổi và đồng bộ manifest lên cluster.

Các GitLab CI/CD variable cần có:

| Biến | Mục đích |
| --- | --- |
| `HARBOR_REGISTRY` | Registry/project dùng để tạo image repository |
| `HARBOR_USERNAME` | Tài khoản đẩy image |
| `HARBOR_PASSWORD` | Mật khẩu hoặc robot token |
| `GIT_PUSH_TOKEN` | Token cho phép pipeline push commit cập nhật manifest |
| `MONGO_URI` | Secret được External Secrets lấy cho môi trường dev |

### 7.4. Kiểm tra sau triển khai

```bash
kubectl -n cmp-hms-dev get deploy,pod,svc,ingress
kubectl -n cmp-hms-dev get externalsecret cmp-hms-secret
kubectl -n cmp-hms-dev rollout status deployment/cmp-hms
kubectl -n cmp-hms-dev logs deployment/cmp-hms --tail=200
curl -k https://dev-cmp-api.vnpost.vn/hms/api
```

Readiness và liveness probe gọi `GET /api` trên cổng container `3000`.

## 8. Rollback

Xác định lịch sử rollout:

```bash
kubectl -n cmp-hms-dev rollout history deployment/cmp-hms
```

Rollback về revision trước:

```bash
kubectl -n cmp-hms-dev rollout undo deployment/cmp-hms
kubectl -n cmp-hms-dev rollout status deployment/cmp-hms
```

Vì Fleet quản lý trạng thái mong muốn từ Git, rollback trực tiếp trên cluster có thể bị ghi đè ở lần đồng bộ tiếp theo. Để rollback ổn định, cần đồng thời khôi phục image tag phù hợp trong `fleet/dev/deployment.yaml` và commit thay đổi.

## 9. Tác vụ định kỳ

Dịch vụ chạy các tác vụ nền trong cùng tiến trình ứng dụng:

| Tác vụ | Lịch chạy |
| --- | --- |
| Kiểm tra trạng thái thiết bị | Mỗi 30 giây |
| Tạo báo cáo topology hằng ngày | `23:30` theo múi giờ của tiến trình |
| Kiểm tra xoay vòng và dọn log | Mỗi 5 phút |

Nên cấu hình `APP_TZ` rõ ràng để thời điểm chạy báo cáo không phụ thuộc múi giờ mặc định của image hoặc node Kubernetes.

## 10. Lưu ý vận hành

- Deployment hiện chạy một replica, phù hợp với cấu hình dev.
- Request tài nguyên hiện tại là `100m CPU / 128Mi RAM`; limit là `500m CPU / 512Mi RAM`.
- TypeORM đang bật `synchronize: true`; cần đánh giá lại trước khi dùng cho môi trường production.
- Dockerfile hiện chưa kích hoạt user không phải root dù đã có phần lệnh mẫu bị comment.
- CORS hiện cho phép phản chiếu origin và gửi credential; cần giới hạn origin ở môi trường production.
- Swagger hiện được công bố không có xác thực.
- Health check chỉ xác nhận tiến trình ứng dụng phản hồi, chưa xác nhận kết nối MongoDB.
- Khi tăng số replica, cần kiểm tra kỹ cơ chế distributed lock cho các cron job.
- Cần theo dõi dung lượng MongoDB, log, tỷ lệ restart Pod, lỗi probe và thời gian phản hồi API.
