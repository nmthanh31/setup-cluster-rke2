# Báo cáo Cấu hình Phân quyền RBAC (Role-Based Access Control)


---

## 1. Tổng quan Phân quyền của các User

| Đối tượng (User) | Namespace áp dụng | Vai trò (Role) | Mức độ quyền hạn | Mục đích chính |
| :--- | :--- | :--- | :--- | :--- |
| **`m-nbdqk`** | `kyverno` | `kyverno-monitoring-editor` | Rất cao (Editor/Admin cục bộ + Monitoring) | Quản trị viên của Kyverno kiêm quản lý giám sát (Monitoring) |
| **`m-nbdqk`** | `cattle-monitoring-system` | `grafana-proxy-access` | Trung bình (Đọc + Tạo cấu hình) | Cho phép xem và proxy truy cập vào Dashboard Grafana |
| **`m-9jmn2`** | `elk-dung` | `elk-dung-editor` | Cao (Editor/Admin cục bộ) | Quản trị và triển khai các tài nguyên ứng dụng (ELK stack) |
| **`m-lwjtk`** | `cattle-monitoring-system` | `grafana-full-access` | Toàn quyền (Full CRUD) | Toàn quyền thao tác trên tài nguyên giám sát liên quan Grafana |

---

## 2. Chi tiết từng cấu hình RBAC

### 2.1. Cấu hình Kyverno:

*   **Namespace:** `kyverno`
*   **Người nhận quyền:** User `m-nbdqk`
*   **Role & RoleBinding:** `kyverno-monitoring-editor` & `kyverno-monitoring-editor-m-nbdqk`

#### Bảng chi tiết quyền hạn:
| Nhóm API (apiGroups) | Tài nguyên (resources) | Các hành động (verbs) | Giải thích chức năng |
| :--- | :--- | :--- | :--- |
| `monitoring.coreos.com` | `servicemonitors`, `podmonitors`, `prometheusrules` | CRUD (`get`, `list`, `watch`, `create`, `update`, `patch`, `delete`) | Quản lý việc thu thập metrics cấu hình Prometheus cho Kyverno |
| `rbac.authorization.k8s.io` | `roles`, `rolebindings` | CRUD | Quản lý và phân quyền nội bộ trong namespace `kyverno` |
| `""` (Core API) | `serviceaccounts`, `secrets`, `configmaps`, `services` | CRUD | Quản lý tài khoản dịch vụ, thông tin nhạy cảm và cấu hình mạng cơ bản |
| `apps` | `deployments` | CRUD | Triển khai, cập nhật và quản lý các Pod Kyverno |
| `batch` | `jobs` | CRUD | Chạy và quản lý các công việc batch bổ trợ |
| `networking.k8s.io` | `ingresses` | CRUD | Quản lý các cấu hình định tuyến / Ingress |

---

### 2.2. Cấu hình Grafana Proxy Access:
*   **Namespace:** `cattle-monitoring-system`
*   **Người nhận quyền:** User `m-nbdqk`
*   **Role & RoleBinding:** `grafana-proxy-access` & `grafana-proxy-access-m-nbdqk`

#### Bảng chi tiết quyền hạn:
| Nhóm API (apiGroups) | Tài nguyên (resources) | Các hành động (verbs) | Giải thích chức năng |
| :--- | :--- | :--- | :--- |
| `""` (Core API) | `services`, `services/proxy`, `endpoints`, `pods`, `configmaps` | `get`, `list`, `watch`, `create` | Đọc thông tin mạng và cho phép kết nối proxy tới Grafana để truy cập Web UI. Hạn chế sửa/xóa để đảm bảo an toàn. |

---

### 2.3. Cấu hình ELK:

*   **Namespace:** `elk-dung`
*   **Người nhận quyền:** User `m-9jmn2`
*   **Role & RoleBinding:** `elk-dung-editor` & `elk-dung-editor-m-9jmn2`

#### Bảng chi tiết quyền hạn:
| Nhóm API (apiGroups) | Tài nguyên (resources) | Các hành động (verbs) | Giải thích chức năng |
| :--- | :--- | :--- | :--- |
| `rbac.authorization.k8s.io` | `roles`, `rolebindings` | CRUD (`get`, `list`, `watch`, `create`, `update`, `patch`, `delete`) | Quản lý phân quyền nội bộ trong namespace `elk-dung` |
| `""` (Core API) | `serviceaccounts`, `secrets`, `configmaps`, `services`, `persistentvolumeclaims` | CRUD | Quản lý tài nguyên cơ bản (Service Account, Secret, ConfigMap, Service) và yêu cầu cấp phát bộ nhớ ngoài (PVC) |
| `batch` | `jobs`, `cronjobs` | CRUD | Triển khai các tác vụ dọn dẹp hoặc khởi tạo định kỳ (Curator, Backup) |
| `apps` | `deployments`, `statefulsets`, `daemonsets` | CRUD | Triển khai và quản lý vòng đời của các ứng dụng (Logstash, Elasticsearch, Kibana, Beats) |
| `networking.k8s.io` | `ingresses` | CRUD | Cấu hình tên miền công khai / Ingress truy cập vào Kibana hoặc dịch vụ khác |

---

### 2.4. Cấu hình Test Grafana Full Access:
*   **Namespace:** `cattle-monitoring-system`
*   **Người nhận quyền:** User `m-lwjtk`
*   **Role & RoleBinding:** `grafana-full-access` & `grafana-full-access-m-lwjtk`

#### Bảng chi tiết quyền hạn:
| Nhóm API (apiGroups) | Tài nguyên (resources) | Các hành động (verbs) | Giải thích chức năng |
| :--- | :--- | :--- | :--- |
| `""` (Core API) | `services`, `services/proxy`, `endpoints`, `pods`, `configmaps` | `*` (Toàn bộ) | Cấp quyền tuyệt đối trên các tài nguyên này phục vụ mục đích kiểm thử/quản trị toàn diện hệ thống Grafana. |

---

## 3. Khuyến nghị & Lưu ý Bảo mật
1. **Quyền hạn `services/proxy`:** Cần kiểm soát chặt chẽ ai có quyền `create` hoặc `*` trên `services/proxy` vì quyền này cho phép bỏ qua một số rào cản xác thực để truy cập thẳng vào dịch vụ đầu cuối.
2. **Quyền tự phân quyền (`roles`, `rolebindings`):** Cả user `m-nbdqk` (trong namespace `kyverno`) và user `m-9jmn2` (trong namespace `elk-dung`) đều có quyền quản lý Role và RoleBinding cục bộ. Hãy đảm bảo họ không thể leo thang đặc quyền lên mức ClusterRole hoặc tác động ra ngoài Namespace được chỉ định.

---

## 4. Yêu cầu Quyền hạn Triển khai (ELK & Kyverno)

Dưới đây là bảng tổng hợp tất cả các quyền hạn cần thiết để triển khai và vận hành thành công ELK Stack và Kyverno trong cụm Kubernetes.

### 4.1. Quyền hạn cần thiết để triển khai ELK Stack
Để triển khai đầy đủ cụm ELK (Elasticsearch, Logstash, Kibana và log collector như Filebeat/Elastic Agent) trong Namespace `elk-dung`:

#### A. Quyền trong Namespace `elk-dung` (Namespace-scoped)
Đây là các quyền cần thiết để tạo, cấu hình và quản trị các cấu phần ELK. *Hiện tại user **`m-9jmn2`** đã được cấp đầy đủ các quyền này thông qua file [rbac-elk.yaml](file:///d:/Projects/ResourceCheck/rbac/rbac-elk.yaml):*

| Nhóm API (apiGroups) | Tài nguyên (resources) | Hành động (verbs) | Mục đích sử dụng |
| :--- | :--- | :--- | :--- |
| `apps` | `deployments`, `statefulsets`, `daemonsets` | CRUD | Triển khai Kibana/Logstash (`deployments`), Elasticsearch (`statefulsets`) và Beats cục bộ (`daemonsets`). |
| `""` (Core) | `persistentvolumeclaims` | CRUD | Yêu cầu cấp phát dung lượng ổ đĩa (Persistent Volumes) để Elasticsearch lưu dữ liệu/chỉ mục. |
| `""` (Core) | `services`, `endpoints`, `configmaps`, `secrets` | CRUD | Thiết lập mạng nội bộ, lưu cấu hình và thông tin bảo mật (mật khẩu Elasticsearch, certificates). |
| `""` (Core) | `serviceaccounts` | CRUD | Tạo ServiceAccount riêng cho các ứng dụng ELK hoạt động. |
| `batch` | `jobs`, `cronjobs` | CRUD | Chạy các tác vụ cài đặt một lần hoặc dọn dẹp logs định kỳ (Curator). |
| `networking.k8s.io` | `ingresses` | CRUD | Cung cấp tên miền/đường dẫn truy cập từ bên ngoài vào Kibana UI. |
| `rbac.authorization.k8s.io`| `roles`, `rolebindings` | CRUD | Tự cấu hình phân quyền phụ trợ nội bộ trong namespace `elk-dung`. |

#### B. Quyền cấp Cluster (Cluster-scoped)
*Quyền này **chỉ** cần thiết nếu triển khai Agent (như Filebeat/Elastic Agent) để thu thập log hệ thống của toàn cụm. Hiện tại user **`m-9jmn2`** chưa có:*
*   **Tài nguyên:** `pods`, `namespaces`, `nodes` (quyền `get`, `list`, `watch`).
*   **Mục đích:** Cho phép Log Agent truy cập và đọc siêu dữ liệu (metadata) của tất cả Pod/Namespace trên toàn cụm để gắn nhãn (label) cho log chính xác.
*   **Lưu ý Bảo mật:** Nếu cụm áp dụng Pod Security Standards, Agent có thể cần quyền sử dụng đặc quyền hostPath mount để đọc trực tiếp file log từ `/var/log/pods` trên worker node.

---

### 4.2. Quyền hạn cần thiết để triển khai Kyverno
Kyverno hoạt động như một công cụ kiểm soát chính sách toàn diện cho cụm (Cluster-wide Policy Engine). Do đó, việc triển khai Kyverno phức tạp hơn và đòi hỏi các quyền hạn cấp Cluster.

#### A. Quyền trong Namespace `kyverno` (Namespace-scoped)
Dùng để chạy các Pod bộ điều khiển (controller) của Kyverno và giám sát metrics. *Hiện tại user **`m-nbdqk`** đã được cấp đầy đủ quyền này qua file [rbac-kyverno.yaml](file:///d:/Projects/ResourceCheck/rbac/rbac-kyverno.yaml):*
*   **Các tài nguyên:** `deployments`, `services`, `configmaps`, `secrets`, `serviceaccounts`, `jobs`, `cronjobs`, `ingresses`, `leases`, `poddisruptionbudgets`, `roles`, `rolebindings`.
*   **Giám sát (Prometheus):** Quyền CRUD đối với `servicemonitors`, `podmonitors`, `prometheusrules` (API Group `monitoring.coreos.com`) để lấy metrics giám sát hoạt động của Kyverno.

#### B. Quyền cấp Cluster (Cluster-scoped) - BẮT BUỘC để cài đặt/vận hành Kyverno
*Các quyền này đã được thêm vào cấu hình của user **`m-nbdqk`** thông qua ClusterRole và ClusterRoleBinding mới trong file [rbac-kyverno.yaml](file:///d:/Projects/ResourceCheck/rbac/rbac-kyverno.yaml):*

| Nhóm API (apiGroups) | Tài nguyên (resources) | Hành động (verbs) | Mục đích sử dụng |
| :--- | :--- | :--- | :--- |
| `admissionregistration.k8s.io` | `mutatingwebhookconfigurations`, `validatingwebhookconfigurations` | CRUD | Đăng ký webhook để Kubernetes API Server chuyển tiếp tất cả các yêu cầu tạo/sửa đổi tài nguyên qua Kyverno kiểm tra chính sách. |
| `apiextensions.k8s.io` | `customresourcedefinitions` (CRDs) | CRUD | Tạo các định nghĩa tài nguyên tùy biến của Kyverno (như `ClusterPolicy`, `Policy`, `PolicyReport`). |
| `rbac.authorization.k8s.io` | `clusterroles`, `clusterrolebindings` | CRUD | Tạo ClusterRole/Binding cấp cluster cho ServiceAccount của Kyverno có quyền quét và tự động sinh tài nguyên trên toàn bộ các namespace. |
| `kyverno.io` | `clusterpolicies`, `policies`, `cleanuppolicies` | CRUD | Quản lý và khai báo các chính sách bảo mật hệ thống. |
| `wgpolicyk8s.io` | `clusterpolicyreports`, `policyreports` | CRUD | Ghi nhận và báo cáo các vi phạm chính sách của cụm. |
| `*` (Tất cả các nhóm) | `*` (Tất cả tài nguyên) | `get`, `list`, `watch`, `create`, `update`, `patch` | Bản thân Kyverno cần quyền đọc/ghi hầu hết tài nguyên trong cluster để đánh giá chính sách và tự động tạo tài nguyên (ví dụ: tự động nhân bản ImagePullSecrets sang Namespace mới tạo). |

> [!TIP]
> Việc tạo các tài nguyên cấp Cluster (ClusterRole, ClusterRoleBinding, CustomResourceDefinitions, Webhook Configurations) yêu cầu tài khoản thực thi lệnh `kubectl apply` phải có đặc quyền **Cluster-Admin**. Hãy chắc chắn bạn đang dùng tài khoản quản trị để áp dụng file [rbac-kyverno.yaml](file:///d:/Projects/ResourceCheck/rbac/rbac-kyverno.yaml) này.
