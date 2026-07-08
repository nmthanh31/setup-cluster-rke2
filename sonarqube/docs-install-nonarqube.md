# Báo cáo giới thiệu chung về SonarQube

## 1. Giới thiệu chung về SonarQube

SonarQube là nền tảng phân tích chất lượng mã nguồn tĩnh, được sử dụng để đánh giá chất lượng code, phát hiện lỗi tiềm ẩn, lỗ hổng bảo mật, mã nguồn khó bảo trì và các điểm không tuân thủ coding standard trong quá trình phát triển phần mềm.

Trong môi trường doanh nghiệp, SonarQube thường được tích hợp vào quy trình CI/CD để tự động phân tích mã nguồn mỗi khi có thay đổi trên repository, merge request, pull request hoặc pipeline build. Kết quả phân tích được tập trung trên giao diện SonarQube Server, giúp developer, technical lead, QA, security team và management có cùng một nguồn thông tin về tình trạng chất lượng phần mềm.

SonarQube hỗ trợ nhiều ngôn ngữ lập trình phổ biến như Java, JavaScript, TypeScript, C#, Python, PHP, Go, Kotlin, C/C++, Ruby và nhiều ngôn ngữ khác. Tùy theo phiên bản sử dụng, SonarQube có thể hỗ trợ thêm các tính năng nâng cao như branch analysis, pull request decoration, security analysis chuyên sâu, compliance report và khả năng quản trị ở quy mô lớn.

Các nhóm vấn đề chính mà SonarQube phân tích bao gồm:

- **Bugs**: Lỗi tiềm ẩn trong mã nguồn, có thể gây sai logic, lỗi runtime hoặc hành vi không mong muốn.
- **Vulnerabilities**: Các lỗ hổng bảo mật có nguy cơ bị khai thác.
- **Security Hotspots**: Các điểm cần được rà soát thủ công về mặt bảo mật.
- **Code Smells**: Các vấn đề ảnh hưởng đến khả năng đọc, bảo trì và mở rộng mã nguồn.
- **Duplications**: Đoạn mã nguồn bị trùng lặp, làm tăng chi phí bảo trì.
- **Coverage**: Tỷ lệ mã nguồn được bao phủ bởi unit test hoặc automated test.
- **Maintainability, Reliability, Security Rating**: Các chỉ số tổng hợp đánh giá khả năng bảo trì, độ tin cậy và mức độ an toàn của project.

Giá trị lớn nhất của SonarQube không chỉ nằm ở việc phát hiện lỗi, mà còn nằm ở khả năng thiết lập một chuẩn chất lượng có thể đo lường và áp dụng nhất quán trên toàn bộ vòng đời phát triển phần mềm. Thông qua cơ chế **Quality Gate**, doanh nghiệp có thể định nghĩa ngưỡng chất lượng bắt buộc trước khi code được merge, build hoặc triển khai lên môi trường cao hơn.

## 2. Định hướng kiến trúc

SonarQube được thiết kế theo mô hình client-server. Trong đó, SonarQube Server đóng vai trò trung tâm quản lý, Scanner đóng vai trò thu thập và phân tích mã nguồn, Database lưu trữ cấu hình và kết quả phân tích, còn CI/CD Pipeline đóng vai trò kích hoạt quá trình scan theo từng workflow phát triển.

### 2.1 Kiến trúc tổng thể

Mô hình triển khai SonarQube có thể hiểu như sau:

```text
Developer / Git Repository
          |
          v
CI/CD Pipeline
          |
          v
SonarScanner
          |
          v
SonarQube Server <----> Database
          |
          v
Dashboard / Quality Gate / Report
```

Luồng hoạt động cơ bản:

1. Developer push code lên Git repository hoặc tạo merge request.
2. CI/CD pipeline được kích hoạt theo cấu hình của từng dự án.
3. Pipeline chạy SonarScanner để phân tích mã nguồn.
4. Scanner gửi kết quả phân tích về SonarQube Server.
5. SonarQube Server xử lý kết quả, lưu dữ liệu vào Database và đánh giá Quality Gate.
6. Pipeline đọc trạng thái Quality Gate để quyết định cho phép tiếp tục build, merge hoặc deploy hay không.

### 2.2 Các thành phần chính

#### SonarQube Server

SonarQube Server là thành phần trung tâm, cung cấp giao diện web và API để người dùng quản lý, theo dõi và khai thác kết quả phân tích. Thành phần này đảm nhận các nhiệm vụ:

- Quản lý project, branch, user, group và permission.
- Quản lý rule, quality profile và quality gate.
- Tiếp nhận kết quả phân tích từ SonarScanner.
- Tổng hợp metrics và hiển thị dashboard chất lượng.
- Cung cấp API cho CI/CD, webhook và các hệ thống tích hợp khác.
- Tích hợp với GitLab, GitHub, Bitbucket, Azure DevOps, LDAP, SAML hoặc các hệ thống xác thực tập trung.

#### Database

Database được sử dụng để lưu trữ cấu hình và dữ liệu phân tích của SonarQube, bao gồm:

- Thông tin project.
- Lịch sử phân tích.
- Kết quả Quality Gate.
- Cấu hình rule và Quality Profile.
- Cấu hình người dùng, nhóm quyền và phân quyền.
- Metadata phục vụ dashboard, report và audit.

Trong môi trường production, database nên được triển khai độc lập với SonarQube Server để đảm bảo hiệu năng, backup, restore, giám sát và khả năng mở rộng.

#### SonarScanner

SonarScanner là thành phần chạy ở phía client hoặc trong CI/CD pipeline. Scanner có nhiệm vụ đọc cấu hình project, phân tích mã nguồn, thu thập test report, coverage report và gửi kết quả về SonarQube Server.

Tùy theo công nghệ của dự án, có thể sử dụng các loại scanner sau:

- SonarScanner CLI.
- SonarScanner for Maven.
- SonarScanner for Gradle.
- SonarScanner for .NET.
- Scanner plugin trong Jenkins, GitLab CI, GitHub Actions, Azure DevOps hoặc Bitbucket Pipeline.

#### Rule Engine và Quality Profile

Rule Engine là cơ chế đánh giá code dựa trên bộ rule của từng ngôn ngữ lập trình. Các rule được gom vào **Quality Profile**. Doanh nghiệp có thể sử dụng profile mặc định của SonarQube hoặc tùy biến profile riêng theo chuẩn coding convention nội bộ.

Quality Profile giúp:

- Chuẩn hóa rule theo ngôn ngữ lập trình.
- Bật/tắt các rule phù hợp với đặc thù dự án.
- Điều chỉnh mức độ nghiêm trọng của rule.
- Áp dụng cùng một chuẩn code cho nhiều project.
- Tách profile cho dự án mới, dự án legacy, frontend, backend hoặc thư viện dùng chung.

#### Quality Gate

Quality Gate là tập hợp các điều kiện đánh giá chất lượng code. Nếu project không đạt Quality Gate, pipeline có thể bị đánh dấu failed hoặc bị chặn trước khi merge/deploy.

Ví dụ Quality Gate chuẩn doanh nghiệp:

- Security Rating trên new code đạt mức A.
- Reliability Rating trên new code đạt mức A.
- Maintainability Rating trên new code đạt mức A.
- Coverage trên new code đạt tối thiểu 80%.
- Duplicated Lines trên new code không vượt quá 3%.
- Không có Vulnerability mức Critical hoặc Blocker.
- Không có Bug mức Critical hoặc Blocker.

Khi áp dụng trong doanh nghiệp, nên ưu tiên nguyên tắc **Clean as You Code**: không bắt buộc sửa toàn bộ technical debt cũ ngay lập tức, nhưng mọi phần code mới hoặc code thay đổi phải đạt chuẩn chất lượng.

### 2.3 Định hướng triển khai doanh nghiệp

Đối với môi trường doanh nghiệp, SonarQube nên được triển khai như một dịch vụ dùng chung cho nhiều team và nhiều project. Định hướng kiến trúc nên bao gồm:

- Triển khai SonarQube Server tách biệt với Database.
- Sử dụng database production-grade, có backup và monitoring.
- Tích hợp với hệ thống Git và CI/CD hiện có.
- Cấu hình HTTPS thông qua Ingress hoặc reverse proxy.
- Quản lý user thông qua LDAP, Active Directory, SAML hoặc SSO nếu có.
- Sử dụng token riêng cho pipeline, không dùng tài khoản cá nhân.
- Thiết lập Quality Gate mặc định cho toàn bộ project.
- Xây dựng Quality Profile riêng theo ngôn ngữ và loại dự án.
- Cấu hình webhook để trả kết quả scan về pipeline hoặc hệ thống quản trị.
- Theo dõi tài nguyên CPU, RAM, storage và dung lượng database.

Nếu triển khai trên Kubernetes, SonarQube có thể được cài đặt bằng Helm Chart, sử dụng Persistent Volume cho dữ liệu cần lưu trữ, kết nối tới PostgreSQL bên ngoài và expose qua Ingress Controller. Với môi trường sản xuất, cần đánh giá kỹ tài nguyên, chiến lược backup, upgrade và phân quyền truy cập.

## 3. Hướng dẫn cài đặt SonarQube tổng quát

Phần này mô tả cách cài đặt SonarQube trên Kubernetes theo hướng tổng quát, sử dụng Helm Chart và file `values.yaml` để quản lý cấu hình. File `sonarqube/values.yaml` trong repository hiện tại là ví dụ cấu hình cho mô hình triển khai SonarQube Community Edition, dùng PostgreSQL bên ngoài, Persistent Volume qua Longhorn và chưa cấu hình Ingress trực tiếp trong chart.

### 3.1 Mô hình cài đặt đề xuất

Mô hình cài đặt phù hợp cho môi trường nội bộ/doanh nghiệp:

```text
User / CI-CD Pipeline
        |
        v
Ingress / Service
        |
        v
SonarQube Pod
        |
        v
External PostgreSQL
```

Trong mô hình này:

- **SonarQube Pod** chạy ứng dụng SonarQube, bao gồm Web UI, API, Compute Engine và search engine nội bộ.
- **PostgreSQL external** lưu dữ liệu chính của SonarQube như project, issue, rule, user, permission và lịch sử phân tích.
- **Persistent Volume** lưu dữ liệu runtime cần duy trì của SonarQube.
- **Ingress hoặc Service** expose SonarQube để người dùng và pipeline truy cập.
- **Secret** lưu thông tin nhạy cảm như database password, monitoring passcode và token nếu cần.

### 3.2 Các thành phần cần chuẩn bị trước khi cài đặt

Trước khi triển khai SonarQube, cần chuẩn bị các thành phần sau:

| Thành phần | Vai trò |
| --- | --- |
| Kubernetes namespace | Không gian triển khai riêng cho SonarQube |
| Helm Chart | Bộ template dùng để cài đặt SonarQube lên Kubernetes |
| `values.yaml` | File cấu hình giá trị triển khai cho Helm Chart |
| PostgreSQL | Database lưu dữ liệu chính của SonarQube |
| Kubernetes Secret | Lưu password database và monitoring passcode |
| StorageClass/PVC | Cấp persistent volume cho SonarQube |
| Service/Ingress | Cho phép truy cập SonarQube từ user và pipeline |
| Resource request/limit | Kiểm soát CPU/RAM cấp cho pod |

### 3.3 Chuẩn bị namespace

Nên triển khai SonarQube trong namespace riêng để dễ quản lý tài nguyên, secret, network policy và phân quyền.

Ví dụ:

```bash
kubectl create namespace sonarqube
```

Kiểm tra namespace:

```bash
kubectl get namespace sonarqube
```

### 3.4 Chuẩn bị database PostgreSQL

SonarQube cần database để lưu dữ liệu lâu dài. Trong môi trường production, nên dùng PostgreSQL bên ngoài thay vì database được cài kèm chart, vì database bên ngoài dễ backup, restore, monitor và nâng cấp hơn.

Cần chuẩn bị:

- Database name, ví dụ `sonarqube`.
- Database user, ví dụ `sonarqube`.
- Password cho user database.
- Quyền truy cập từ pod SonarQube tới PostgreSQL.
- DNS/service endpoint mà pod SonarQube có thể truy cập.

Trong file `values.yaml` hiện tại, phần kết nối database được cấu hình thông qua nhóm `jdbcOverwrite`. Nhóm cấu hình này cho SonarQube biết cần kết nối tới PostgreSQL nào, dùng user nào và lấy password từ Secret nào.

Ví dụ ý nghĩa cấu hình:

```yaml
postgresql:
  enabled: false

jdbcOverwrite:
  enabled: true
  jdbcUrl: "jdbc:postgresql://<postgres-service>:5432/sonarqube"
  jdbcUsername: "sonarqube"
  jdbcSecretName: "sonarqube-db"
  jdbcSecretPasswordKey: "jdbc-password"
```

Giải thích:

- `postgresql.enabled: false`: Không cài PostgreSQL đi kèm Helm Chart.
- `jdbcOverwrite.enabled: true`: Cho phép khai báo kết nối database bên ngoài.
- `jdbcUrl`: Chuỗi kết nối tới PostgreSQL.
- `jdbcUsername`: User SonarQube dùng để truy cập database.
- `jdbcSecretName`: Tên Kubernetes Secret chứa password.
- `jdbcSecretPasswordKey`: Key trong Secret chứa password.

### 3.5 Chuẩn bị Secret

Không nên ghi trực tiếp password vào file `values.yaml`. Password database và monitoring passcode nên được lưu trong Kubernetes Secret.

Ví dụ Secret cho database:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sonarqube-db
  namespace: sonarqube
type: Opaque
stringData:
  jdbc-password: "<database-password>"
```

Ví dụ Secret cho monitoring passcode:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sonarqube-monitoring
  namespace: sonarqube
type: Opaque
stringData:
  monitoring-passcode: "<monitoring-passcode>"
```

Sau khi tạo Secret, kiểm tra lại:

```bash
kubectl get secret -n sonarqube
```

### 3.6 Cấu hình lưu trữ persistent

SonarQube cần persistent volume để lưu một số dữ liệu runtime. Trong repository hiện tại, file value đang dùng StorageClass `longhorn`.

Ví dụ cấu hình:

```yaml
persistence:
  enabled: true
  storageClass: "longhorn"
  accessMode: ReadWriteOnce
  size: 5Gi
```

Giải thích:

- `enabled: true`: Bật persistent volume.
- `storageClass`: Chỉ định hệ thống lưu trữ Kubernetes sẽ cấp volume, ví dụ Longhorn.
- `accessMode: ReadWriteOnce`: Volume được mount read-write bởi một node tại một thời điểm.
- `size`: Dung lượng volume cấp cho SonarQube.

Trước khi cài đặt, cần kiểm tra StorageClass có tồn tại:

```bash
kubectl get storageclass
```

Với môi trường production, cần theo dõi dung lượng volume và xây dựng cơ chế backup phù hợp.

### 3.7 Cấu hình tài nguyên CPU/RAM

SonarQube tiêu thụ nhiều tài nguyên hơn các service web thông thường vì phải xử lý phân tích mã nguồn, lưu metric, tính toán issue và cập nhật index nội bộ.

Ví dụ cấu hình:

```yaml
resources:
  requests:
    cpu: "200m"
    memory: "2Gi"
  limits:
    cpu: "2"
    memory: "4Gi"
```

Giải thích:

- `requests`: Mức tài nguyên Kubernetes đảm bảo cấp cho pod.
- `limits`: Mức tài nguyên tối đa pod được phép sử dụng.
- Nếu repository lớn hoặc nhiều pipeline scan đồng thời, cần tăng CPU/RAM.
- Nếu memory quá thấp, pod có thể bị `OOMKilled` hoặc SonarQube khởi động không ổn định.

### 3.8 Cấu hình truy cập SonarQube

Sau khi cài đặt, SonarQube cần được expose để user và pipeline truy cập. Có thể dùng một trong các cách:

- `ClusterIP`: Chỉ truy cập nội bộ trong cluster.
- `NodePort`: Truy cập qua IP node và port được mở.
- `LoadBalancer`: Phù hợp nếu hạ tầng có load balancer.
- `Ingress`: Phù hợp nhất cho môi trường doanh nghiệp vì có thể dùng domain, TLS và reverse proxy.

Trong file value hiện tại, `ingress-nginx.enabled` đang tắt. Điều này nghĩa là chart không tự cài Ingress NGINX đi kèm. Nếu cluster đã có Ingress Controller dùng chung, có thể tạo Ingress riêng cho SonarQube.

Ví dụ Ingress tổng quát:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sonarqube
  namespace: sonarqube
spec:
  ingressClassName: nginx
  rules:
    - host: sonarqube.example.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: sonarqube-sonarqube
                port:
                  number: 9000
```

Với production, nên cấu hình thêm HTTPS/TLS.

### 3.9 Về Elasticsearch/Search Engine

Không cần cài Elasticsearch riêng cho mô hình này.

SonarQube có search engine nội bộ chạy trong runtime của SonarQube Server để phục vụ index và tìm kiếm issue, rule, metric. File `values.yaml` hiện tại không có cấu hình Elasticsearch độc lập là đúng với mô hình triển khai này.

Cần phân biệt:

- **PostgreSQL**: Database chính, bắt buộc cần có.
- **Search engine nội bộ**: Thành phần bên trong SonarQube Server, không cần triển khai thành service Elasticsearch riêng.

### 3.10 Cài đặt bằng Helm

Thêm Helm repository của SonarQube:

```bash
helm repo add sonarqube https://SonarSource.github.io/helm-chart-sonarqube
helm repo update
```

Cài đặt hoặc cập nhật SonarQube bằng file value:

```bash
helm upgrade --install sonarqube sonarqube/sonarqube \
  -n sonarqube \
  -f sonarqube/values.yaml
```

Kiểm tra release:

```bash
helm status sonarqube -n sonarqube
```

Kiểm tra pod, service và pvc:

```bash
kubectl get pod,svc,pvc -n sonarqube
```

Theo dõi log:

```bash
kubectl logs -n sonarqube deploy/sonarqube-sonarqube -f
```

### 3.11 Kiểm tra sau cài đặt

Sau khi triển khai, cần kiểm tra:

- Pod SonarQube ở trạng thái `Running`.
- Pod không bị restart liên tục.
- SonarQube kết nối được tới PostgreSQL.
- PVC được tạo và bind thành công.
- Service expose đúng port `9000`.
- Ingress hoặc domain truy cập được giao diện web.
- Đăng nhập được vào SonarQube.
- Tạo project thử và chạy scan thử từ pipeline hoặc máy local.

Một số lỗi thường gặp:

- Sai JDBC URL hoặc Secret database.
- Database chưa được tạo hoặc user chưa có quyền.
- StorageClass không tồn tại hoặc PVC không bind được.
- Pod thiếu RAM dẫn đến `OOMKilled`.
- Ingress trỏ sai service name hoặc sai port.

## 4. Cấu hình Quality Profile và Quality Gate cho doanh nghiệp

Sau khi cài đặt SonarQube, bước quan trọng tiếp theo là chuẩn hóa rule và ngưỡng đánh giá chất lượng cho toàn bộ dự án. Hai thành phần chính cần cấu hình là **Quality Profile** và **Quality Gate**.

### 4.1 Nguyên tắc áp dụng trong doanh nghiệp

Doanh nghiệp nên áp dụng SonarQube theo nguyên tắc **Clean as You Code**. Nghĩa là không yêu cầu xử lý toàn bộ technical debt cũ ngay lập tức, nhưng mọi phần code mới hoặc code thay đổi phải đạt tiêu chuẩn chất lượng.

Nguyên tắc này giúp:

- Không gây quá tải cho các dự án legacy.
- Tạo chuẩn chất lượng bắt buộc cho code mới.
- Giảm dần technical debt theo thời gian.
- Dễ tích hợp vào pipeline mà không làm gián đoạn toàn bộ quy trình phát triển.

### 4.2 Cấu hình Quality Profile

Quality Profile là tập hợp các rule được áp dụng cho từng ngôn ngữ lập trình. Mỗi ngôn ngữ như Java, JavaScript, TypeScript, C#, Python sẽ có một profile riêng.

Khuyến nghị cấu hình:

- Tạo Quality Profile riêng cho doanh nghiệp, không sửa trực tiếp profile mặc định nếu muốn dễ quản lý thay đổi.
- Kế thừa từ profile mặc định của SonarQube, sau đó tùy chỉnh theo coding convention nội bộ.
- Bật các rule liên quan đến bug, security và maintainability.
- Tắt hoặc hạ mức nghiêm trọng các rule không phù hợp với framework/thực tế dự án.
- Phân loại profile theo nhóm công nghệ nếu cần, ví dụ `Enterprise Java`, `Enterprise Frontend`, `Enterprise .NET`.

Các bước thực hiện trên giao diện:

1. Truy cập **Quality Profiles**.
2. Chọn ngôn ngữ cần cấu hình.
3. Copy profile mặc định thành profile mới.
4. Đặt tên profile theo chuẩn doanh nghiệp.
5. Kiểm tra danh sách rule đang active.
6. Bật/tắt hoặc điều chỉnh severity của rule nếu cần.
7. Đặt profile này làm default cho ngôn ngữ tương ứng.

### 4.3 Cấu hình Quality Gate chuẩn doanh nghiệp

Quality Gate là ngưỡng đánh giá để quyết định code có đạt chuẩn hay không. Quality Gate nên tập trung vào **new code** để phù hợp với nguyên tắc Clean as You Code.

Đề xuất Quality Gate mặc định:

| Điều kiện | Ngưỡng đề xuất |
| --- | --- |
| Security Rating on New Code | A |
| Reliability Rating on New Code | A |
| Maintainability Rating on New Code | A |
| Coverage on New Code | >= 80% |
| Duplicated Lines on New Code | <= 3% |
| New Blocker Issues | = 0 |
| New Critical Issues | = 0 |
| New Vulnerabilities | = 0 |
| New Security Hotspots Reviewed | >= 100% |

Các bước cấu hình:

1. Truy cập **Quality Gates**.
2. Tạo Quality Gate mới, ví dụ `Enterprise Quality Gate`.
3. Thêm các condition theo bảng đề xuất.
4. Đặt Quality Gate này làm default.
5. Áp dụng cho các project mới.
6. Với project legacy, có thể áp dụng theo lộ trình để tránh pipeline fail hàng loạt.

### 4.4 Chiến lược áp dụng cho dự án mới và dự án cũ

Với dự án mới:

- Áp dụng Quality Gate mặc định ngay từ đầu.
- Bắt buộc coverage trên new code đạt chuẩn.
- Không cho merge nếu có bug hoặc vulnerability nghiêm trọng.
- Tích hợp Quality Gate vào pipeline từ giai đoạn đầu.

Với dự án legacy:

- Ưu tiên kiểm soát new code.
- Không bắt buộc xử lý toàn bộ issue cũ ngay lập tức.
- Chia technical debt cũ thành backlog xử lý dần.
- Có thể dùng Quality Gate riêng mềm hơn trong giai đoạn chuyển đổi.
- Sau khi ổn định, chuyển dần về Quality Gate chuẩn doanh nghiệp.

## 5. Tích hợp SonarQube trong pipeline và cách cấu hình sử dụng

Sau khi SonarQube đã được cài đặt và cấu hình Quality Gate, cần tích hợp SonarQube vào CI/CD pipeline để việc kiểm tra chất lượng mã nguồn diễn ra tự động.

### 5.1 Mô hình tích hợp pipeline

Mô hình tích hợp cơ bản:

```text
Developer push code
        |
        v
CI/CD Pipeline
        |
        v
Build/Test
        |
        v
SonarScanner
        |
        v
SonarQube Server
        |
        v
Quality Gate Result
        |
        v
Pass: tiếp tục build/deploy
Fail: dừng pipeline hoặc chặn merge
```

### 5.2 Các thông tin cần chuẩn bị

Để tích hợp pipeline, cần chuẩn bị:

- URL SonarQube, ví dụ `https://sonarqube.example.local`.
- Token truy cập SonarQube.
- Project key trên SonarQube.
- Scanner phù hợp với công nghệ dự án.
- File cấu hình `sonar-project.properties` nếu dùng SonarScanner CLI.
- Coverage report nếu muốn kiểm tra coverage.

Token nên được tạo bằng tài khoản kỹ thuật hoặc service account, không nên dùng token cá nhân của developer.

### 5.3 Cấu hình project bằng `sonar-project.properties`

Với SonarScanner CLI, có thể đặt file `sonar-project.properties` ở thư mục gốc của repository:

```properties
sonar.projectKey=my-service
sonar.projectName=My Service
sonar.projectVersion=1.0.0
sonar.sources=src
sonar.tests=tests
sonar.sourceEncoding=UTF-8
sonar.host.url=https://sonarqube.example.local
```

Nếu có coverage report, cần bổ sung cấu hình theo ngôn ngữ. Ví dụ với JavaScript/TypeScript dùng LCOV:

```properties
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.typescript.lcov.reportPaths=coverage/lcov.info
```

Các thư mục không cần scan có thể loại trừ:

```properties
sonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/*.min.js
sonar.coverage.exclusions=**/*Test.*,**/*.spec.ts,**/*.config.js
```

### 5.4 Ví dụ tích hợp với GitLab CI

Ví dụ `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - sonar

variables:
  SONAR_USER_HOME: "${CI_PROJECT_DIR}/.sonar"
  GIT_DEPTH: "0"

unit-test:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm run test -- --coverage
  artifacts:
    paths:
      - coverage/
    expire_in: 1 day

sonarqube-check:
  stage: sonar
  image:
    name: sonarsource/sonar-scanner-cli:latest
    entrypoint: [""]
  dependencies:
    - unit-test
  script:
    - sonar-scanner
      -Dsonar.host.url="${SONAR_HOST_URL}"
      -Dsonar.token="${SONAR_TOKEN}"
      -Dsonar.qualitygate.wait=true
  only:
    - merge_requests
    - main
    - develop
```

Trong GitLab CI/CD Variables cần khai báo:

```text
SONAR_HOST_URL=https://sonarqube.example.local
SONAR_TOKEN=<sonarqube-token>
```

Nên đặt `SONAR_TOKEN` là masked/protected variable.

### 5.5 Ví dụ tích hợp với Jenkins

Ví dụ Jenkinsfile:

```groovy
pipeline {
  agent any

  environment {
    SONAR_HOST_URL = 'https://sonarqube.example.local'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Test') {
      steps {
        sh 'npm ci'
        sh 'npm run test -- --coverage'
      }
    }

    stage('SonarQube Analysis') {
      steps {
        withCredentials([string(credentialsId: 'sonarqube-token', variable: 'SONAR_TOKEN')]) {
          sh '''
            sonar-scanner \
              -Dsonar.host.url=$SONAR_HOST_URL \
              -Dsonar.token=$SONAR_TOKEN \
              -Dsonar.qualitygate.wait=true
          '''
        }
      }
    }
  }
}
```

### 5.6 Cấu hình chặn pipeline bằng Quality Gate

Để pipeline thật sự có giá trị kiểm soát chất lượng, cần kiểm tra kết quả Quality Gate sau khi scan.

Với SonarScanner CLI, có thể bật chế độ chờ Quality Gate:

```bash
sonar-scanner \
  -Dsonar.host.url="${SONAR_HOST_URL}" \
  -Dsonar.token="${SONAR_TOKEN}" \
  -Dsonar.qualitygate.wait=true
```

Khi `sonar.qualitygate.wait=true`, job sẽ chờ SonarQube xử lý xong kết quả phân tích. Nếu Quality Gate fail, job sẽ fail và pipeline bị dừng theo rule của CI/CD.

### 5.7 Best practices khi tích hợp pipeline

- Lưu `SONAR_TOKEN` trong secret/variable của CI/CD, không commit vào repository.
- Dùng service account riêng cho pipeline.
- Chạy unit test và sinh coverage trước bước SonarQube scan.
- Bật Quality Gate wait cho merge request hoặc branch quan trọng.
- Loại trừ thư mục generated code, build output, dependencies và vendor.
- Không bỏ qua Quality Gate bằng tay nếu không có lý do rõ ràng.
- Theo dõi trend chất lượng theo thời gian, không chỉ nhìn một lần scan.

## Kết luận

SonarQube là một thành phần quan trọng trong hệ sinh thái DevSecOps, giúp doanh nghiệp kiểm soát chất lượng mã nguồn một cách tự động, nhất quán và có thể đo lường. Khi được triển khai đúng cách, SonarQube không chỉ giúp phát hiện lỗi sớm mà còn góp phần xây dựng văn hóa phát triển phần mềm sạch, an toàn và bền vững.
