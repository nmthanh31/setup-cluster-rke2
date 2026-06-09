# CMP Portal - Giới thiệu và triển khai dự án

## 1. Giới thiệu dự án

CMP Portal là ứng dụng web quản trị Cloud Management Platform. Ứng dụng cung cấp giao diện web để người dùng và quản trị viên làm việc với các tài nguyên Cloud, tổ chức, dự án, thành viên, phân quyền, thanh toán và các dịch vụ liên quan khác.

Ứng dụng là Single Page Application (SPA), được build thành các file tĩnh và được phục vụ bởi Nginx. Các API nghiệp vụ và xác thực được xử lý bởi các dịch vụ backend.

### 1.1 Công nghệ chính

| Thành phần        | Công nghệ                                |
| ----------------- | ---------------------------------------- |
| Frontend          | React 18, TypeScript                     |
| Giao diện người dùng | Material UI 5, Berry v3.6.0/theme3    |
| Định tuyến        | React Router 6                           |
| Quản lý trạng thái | Redux Toolkit, React Context            |
| HTTP client       | Axios                                    |
| Đa ngôn ngữ       | i18next, tiếng Anh và tiếng Việt         |
| Công cụ build     | Create React App thông qua `react-app-rewired` |
| Trình quản lý gói | Yarn 4.12.0                              |
| Container runtime | Nginx unprivileged, cổng 8080            |
| CI/CD             | GitLab CI, Kaniko, Harbor                |
| GitOps/Kubernetes | Fleet và Kubernetes manifests            |

### 1.2 Yêu cầu phát triển

- Corepack để kích hoạt Yarn 4.
- File `.env` hợp lệ được tạo từ `.env.example`, bao gồm các biến thiết lập kết nối với backend.
- Quyền truy cập tới các dịch vụ backend, AMS, Billing, HMS và Keycloak.

## 2. Chạy dự án trên máy phát triển

### 2.1 Khởi tạo ứng dụng

```bash
corepack enable
corepack prepare yarn@4.12.0 --activate
yarn install --immutable
```

Tùy chọn `--immutable` bảo đảm `package.json` và `yarn.lock` đồng bộ với nhau. Nếu lockfile cần cập nhật, lệnh cài đặt sẽ thất bại.

### 2.2 Tạo cấu hình môi trường

```bash
yarn env:create
```

Lệnh trên tạo file `.env` từ `.env.example`. Cần cập nhật các biến môi trường để ứng dụng hoạt động đúng.

Nhóm biến quan trọng:

| Nhóm              | Biến                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| Phiên bản/build   | `REACT_APP_VERSION`, `GENERATE_SOURCEMAP`                                            |
| API chung         | `REACT_APP_API_URL`                                                                  |
| Keycloak          | `REACT_APP_KEYCLOAK_URL`, `REACT_APP_KEYCLOAK_REALM`, `REACT_APP_KEYCLOAK_CLIENT_ID` |
| AMS/BFF           | `REACT_APP_AMS_HOST`, `REACT_APP_AMS_CALLBACK_URL`                                   |
| Billing           | `REACT_APP_BILLING_HOST`                                                             |
| Proxy phát triển  | `REACT_APP_DEV_PROXY_TARGET`                                                         |
| HMS               | `REACT_APP_HMS_API_URL`                                                              |

Lưu ý:

- Các biến bắt đầu bằng `REACT_APP_` được nhúng vào JavaScript bundle tại thời điểm build.
- `REACT_APP_AMS_CALLBACK_URL` phải được Keycloak cho phép và phải khớp với cấu hình `cmp-ams` ở backend.

### 2.3 Chạy và kiểm tra

```bash
yarn start  # Chạy local
yarn lint
yarn test
yarn build  # Build production sẽ tạo ra thư mục tĩnh /build => artifacts
```

## 3. Kiến trúc triển khai

Luồng truy cập thực tế:

![Flow access](/docs/FE/images/Flow%20access%20FE.png)

Luồng triển khai hiện tại trong môi trường UAT/DEV:

![Flow CI/CD](/docs/FE/images/flow-cicd.png)

## 4. Docker

Hiện tại dự án có hai file Dockerfile: `Dockerfile` và `Dockerfile.ci`.

### 4.1 `Dockerfile`

`Dockerfile` là multi-stage build, phù hợp khi muốn Docker tự cài dependency, build source và tạo runtime image trong một lệnh.

#### Stage `build`

1. Dùng image `node:18-alpine`.
2. Đặt thư mục làm việc là `/app`.
3. Kích hoạt Corepack và Yarn 4.
4. Copy `package.json`, `yarn.lock`, `.yarnrc.yml`.
5. Chạy `yarn install --immutable`.
6. Copy source code.
7. Nhận các `ARG` cấu hình frontend.
8. Chuyển `ARG` thành `ENV` để React đọc tại thời điểm build.
9. Chạy `yarn build`.

#### Stage `runtime`

1. Dùng image `nginxinc/nginx-unprivileged:1.31.1-alpine3.23-slim`.
2. Copy `nginx.conf` vào Nginx template.
3. Copy `/app/build` từ stage build vào `/usr/share/nginx/html`.
4. Chạy Nginx bằng user không đặc quyền trên cổng 8080.
5. Health check so sánh SHA-256 của một file JavaScript với nội dung Nginx trả về.

Ví dụ build:

```bash
docker build \
  --build-arg REACT_APP_VERSION=3.6.0 \
  --build-arg GENERATE_SOURCEMAP=false \
  --build-arg REACT_APP_API_URL=https://example-api \
  --build-arg REACT_APP_KEYCLOAK_URL=https://example-keycloak \
  --build-arg REACT_APP_KEYCLOAK_REALM=example \
  --build-arg REACT_APP_KEYCLOAK_CLIENT_ID=cmp \
  --build-arg REACT_APP_AMS_CALLBACK_URL=https://example/ams/api/v1/auth/callback \
  -t cmp-portal:local .
```

Chạy container:

```bash
docker run --rm -p 8080:8080 cmp-portal:local
```

### 4.2 `Dockerfile.ci`

`Dockerfile.ci` chỉ đóng gói artifact `build/` đã được GitLab CI tạo trước đó. File này không cài Node dependency và không chạy `yarn build`.

Quy trình:

1. Job `build_and_test` tạo thư mục `build/`.
2. GitLab truyền artifact sang job tạo image.
3. Kaniko dùng `Dockerfile.ci`.
4. Lệnh `COPY ${BUILD_DIR}/ /usr/share/nginx/html/` đưa artifact vào image Nginx.

Cách này giúp:

- Tách bước build frontend khỏi bước đóng gói image.
- Tái sử dụng artifact giữa các stage.
- Image runtime chỉ chứa Nginx và static files.
- Kaniko build image mà không cần Docker daemon.

## 5. Cấu hình Nginx

File `nginx.conf` phục vụ SPA trên cổng 8080.

- Document root: `/usr/share/nginx/html`.
- Static assets được cache 3 ngày và trả header `Cache-Control: public, immutable`.
- Route SPA fallback về `/index.html` bằng cấu hình:

```nginx
try_files $uri $uri/ /index.html;
```

- Giới hạn body request là 20 MB.
- Tắt thông báo phiên bản Nginx.
- Thêm các security header:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`

## 6. GitLab CI/CD

Pipeline được khai báo trong `.gitlab-ci.yml`.

### 6.1 Điều kiện kích hoạt

Pipeline chỉ chạy khi:

- Nhánh hiện tại là `dev/cicd`.
- Commit có thay đổi trên các thư mục được theo dõi, ví dụ `src`, `public`,...

### 6.2 Biến pipeline có sẵn

| Biến                       | Giá trị/vai trò                  |
| -------------------------- | -------------------------------- |
| `CI`                       | `true`, chạy build ở chế độ CI   |
| `GENERATE_SOURCEMAP`       | `false`                          |
| `DOCKER_IMAGE_TAG`         | `$CI_COMMIT_SHORT_SHA`           |
| `KUBE_MANIFEST_DIR`        | `fleet/dev`                      |
| `NODE_OPTIONS`             | Giới hạn heap Node 2048 MB       |
| `YARN_ENABLE_GLOBAL_CACHE` | `false`                          |

Cache Yarn được gắn key theo `yarn.lock` và lưu tại `.yarn/cache/`.

### 6.3 Job `build_and_test`

Job dùng image `node:18-alpine` và runner tag `dev-cicd`.

Trình tự:

1. Kích hoạt Corepack và Yarn 4.12.0.
2. Cài dependency bằng `yarn install --immutable`.
3. Kiểm tra biến file `ENV_APP`.
4. Copy nội dung `ENV_APP` vào `.env`.
5. Kiểm tra `.env` tồn tại, không rỗng và có ba biến Keycloak bắt buộc.
6. Chạy `yarn build`.
7. Lưu `build/` làm artifact trong 1 ngày.

Tên job có chữ `test`, nhưng hiện tại job chỉ build, chưa chạy `yarn lint` hoặc `yarn test`.

### 6.4 Job `build_and_push_image`

Job dùng Kaniko debug image và nhận artifact từ `build_and_test`.

Trình tự:

1. Kiểm tra các biến Harbor bắt buộc.
2. Chuẩn hóa địa chỉ registry, bỏ tiền tố `http://` hoặc `https://`.
3. Tạo tên project dạng chữ thường.
4. Xác định image:
   - Dùng `DOCKER_IMAGE` nếu được khai báo.
   - Nếu không có `DOCKER_IMAGE`, dùng `<HARBOR_REGISTRY>/<ci-project-name-lower>`.
5. Tạo Docker auth config cho Kaniko.
6. Build bằng `Dockerfile.ci`.
7. Push image với tag là Git short SHA.

Pipeline đang dùng `--skip-tls-verify-registry`. Chỉ nên duy trì tùy chọn này nếu Harbor dùng certificate chưa được runner tin cậy. Với môi trường production, nên dùng CA hợp lệ và không nên bỏ qua bước xác thực TLS.

### 6.5 Job `update_fleet`

Sau khi push image thành công, job thực hiện:

1. Tạo giá trị image mới từ registry và Git short SHA.
2. Dùng `sed` thay dòng `image:` trong `fleet/dev/deployment.yaml`.
3. Commit với thông điệp:
   `chore: update image tag to <short-sha> [skip ci]`.
4. Push lại nhánh hiện tại và bỏ qua pipeline của commit cập nhật manifest.

Job cần token có quyền push repository.

### 6.6 Job `rollback_fleet`

Đây là job manual và được phép failure.

Job chỉ rollback khi commit mới nhất có đúng subject do job `update_fleet` tạo ra cho image tag hiện tại. Sau đó job thực hiện:

1. Fetch nhánh.
2. Checkout trạng thái mới nhất.
3. Xác minh commit cần revert.
4. Chạy `git revert` đối với commit cập nhật image.
5. Push commit revert với `ci.skip`.

Fleet sẽ nhận thấy manifest quay lại image trước đó và đồng bộ Kubernetes.

### 6.7 Biến CI/CD cần cấu hình

| Biến              | Bắt buộc | Mô tả                                                   |
| ----------------- | -------- | ------------------------------------------------------- |
| `ENV_APP`         | Có       | GitLab File variable hoặc nội dung `.env` dùng để build |
| `HARBOR_REGISTRY` | Có       | Địa chỉ registry, có thể kèm project path               |
| `HARBOR_USERNAME` | Có       | Tài khoản push image                                    |
| `HARBOR_PASSWORD` | Có       | Mật khẩu/token push image                               |
| `DOCKER_IMAGE`    | Không    | Ghi đè tên image đầy đủ                                 |
| `GIT_PUSH_TOKEN`  | Không    | Token push manifest; fallback là `CI_JOB_TOKEN`         |

Khuyến nghị đánh dấu các biến nhạy cảm là masked và protected. `ENV_APP` phải được quản lý theo từng environment và không được in nội dung vào log.

## 7. Fleet và Kubernetes

Fleet đọc cấu hình tại `fleet/fleet.yaml`.

```yaml
defaultNamespace: cmp-portal-dev
```

Tất cả resource dev được triển khai vào namespace `cmp-portal-dev`.

### 7.1 Deployment

File: `fleet/dev/deployment.yaml`.

Cấu hình hiện tại:

| Thuộc tính           | Giá trị              |
| -------------------- | -------------------- |
| Deployment           | `cmp-portal`         |
| Namespace            | `cmp-portal-dev`     |
| Replica              | 1                    |
| Container port       | 8080                 |
| Pull policy          | `Always`             |
| Image pull secret    | `harbor-pull-secret` |
| CPU request/limit    | 100m / 500m          |
| Memory request/limit | 128Mi / 512Mi        |

Readiness probe gọi `/` sau 5 giây, chu kỳ 10 giây. Liveness probe gọi `/` sau 15 giây, chu kỳ 20 giây.

Image tag trong manifest là giá trị được CI tự động cập nhật sau mỗi lần push image thành công. Không nên sửa image tag thủ công trong quy trình thông thường.

### 7.2 Service

File: `fleet/dev/service.yaml`.

- Tên: `cmp-portal`.
- Loại: `ClusterIP`.
- Cổng trong cluster: 80.
- Chuyển tiếp tới named port `http`, tức container port 8080.

### 7.3 Ingress

File: `fleet/dev/ingress.yaml`.

- Ingress class: `nginx`.
- Host: `dev-cmp-portal.vnpost.vn`.
- Bắt buộc chuyển hướng HTTPS.
- TLS secret: `dev-cmp-portal-tls`.
- Certificate issuer: `selfsigned-cluster-issuer`.
- Tất cả request path `/` được chuyển tới Service `cmp-portal`, cổng 80.

### 7.4 Điều kiện trên cluster

Cluster cần có:

- Namespace `cmp-portal-dev`, hoặc Fleet có quyền tạo namespace.
- Fleet agent đang theo dõi đúng repository/branch.
- Nginx Ingress Controller với class `nginx`.
- cert-manager và `ClusterIssuer` tên `selfsigned-cluster-issuer`.
- Secret `harbor-pull-secret` trong namespace `cmp-portal-dev`.
- DNS `dev-cmp-portal.vnpost.vn` trỏ tới ingress endpoint.
- Quyền kéo image từ Harbor.

## 8. Quy trình triển khai development

### Bước 1: Chuẩn bị thay đổi

```bash
yarn install --immutable
yarn lint
yarn test --watchAll=false
yarn build
```

### Bước 2: Đẩy thay đổi lên nhánh CI

Push commit lên `dev/cicd`. Pipeline chỉ được tạo nếu file thay đổi nằm trong danh sách `workflow.rules.changes`.

### Bước 3: Theo dõi pipeline

Xác nhận lần lượt:

- `build_and_test` thành công và có artifact `build/`.
- `build_and_push_image` push được image có tag short SHA.
- `update_fleet` tạo commit cập nhật deployment manifest.

### Bước 4: Theo dõi Fleet

Kiểm tra Fleet bundle ở trạng thái Ready và resource trong namespace `cmp-portal-dev` đã đồng bộ với Git.

### Bước 5: Kiểm tra Kubernetes

Ví dụ:

```bash
kubectl -n cmp-portal-dev get deployment,pod,service,ingress
kubectl -n cmp-portal-dev rollout status deployment/cmp-portal
kubectl -n cmp-portal-dev describe pod -l app=cmp-portal
kubectl -n cmp-portal-dev logs deployment/cmp-portal
```

### Bước 6: Smoke test

- Mở `https://dev-cmp-portal.vnpost.vn`.
- Kiểm tra static assets tải thành công, không có lỗi 404.
- Refresh tại một route SPA bất kỳ và xác nhận trang vẫn tải được.
- Kiểm tra đăng nhập Keycloak và callback AMS.
- Kiểm tra một luồng API có xác thực.
- Kiểm tra readiness/liveness probe không failure.

## 9. Rollback

### 9.1 Rollback bằng GitLab

Chạy manual job `rollback_fleet` của pipeline cần hoàn tác. Job revert commit cập nhật image và Fleet sẽ đồng bộ image cũ.

### 9.2 Rollback bằng Git

Nếu không dùng job manual, có thể revert commit cập nhật manifest và push lên nhánh Fleet đang theo dõi:

```bash
git revert <manifest-update-commit>
git push
```

Không nên chỉ dùng `kubectl set image` để rollback lâu dài vì Fleet có thể đưa cluster trở lại trạng thái trong Git.

### 9.3 Xác minh sau rollback

```bash
kubectl -n cmp-portal-dev rollout status deployment/cmp-portal
kubectl -n cmp-portal-dev get pods
```

Sau đó lặp lại smoke test.
