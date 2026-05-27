# Tìm hiểu Helm và cách xây dựng Helm Chart

## 1. Mục tiêu tài liệu

Tài liệu này dùng để tổng hợp kiến thức cơ bản về Helm và cách xây dựng Helm Chart phục vụ triển khai ứng dụng trên Kubernetes.

Sau khi đọc tài liệu, người đọc cần nắm được:

- Helm là gì.
- Helm Chart dùng để làm gì.
- Cấu trúc cơ bản của một Helm Chart.
- Cách viết `values.yaml` và template Kubernetes manifest.
- Cách render, kiểm tra, cài đặt, nâng cấp và gỡ một Helm release.
- Một số lưu ý khi sử dụng Helm trong môi trường Kubernetes/Rancher.

---

## 2. Helm là gì?

Helm là công cụ quản lý package cho Kubernetes. Có thể hiểu Helm tương tự như `apt`, `yum` hoặc `dnf`, nhưng thay vì cài package cho hệ điều hành, Helm dùng để đóng gói và triển khai tài nguyên Kubernetes.

Thay vì phải apply nhiều file YAML riêng lẻ như:

```bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f configmap.yaml
```

Helm cho phép gom các manifest đó vào một gói gọi là **Helm Chart**, sau đó triển khai bằng một lệnh:

```bash
helm install my-app ./my-app
```

Helm giúp chuẩn hóa việc triển khai ứng dụng, quản lý version, rollback, tái sử dụng cấu hình và template hóa manifest Kubernetes.

---

## 3. Các khái niệm chính trong Helm

### 3.1. Chart

Chart là gói cài đặt của Helm. Một Chart chứa các file mô tả tài nguyên Kubernetes như Deployment, Service, Ingress, ConfigMap, Secret, ServiceAccount, RBAC.

Ví dụ:

```text
my-app/
  Chart.yaml
  values.yaml
  templates/
    deployment.yaml
    service.yaml
    ingress.yaml
```

### 3.2. Release

Release là một lần cài đặt cụ thể của Chart vào Kubernetes cluster.

Ví dụ cùng một Chart `nginx` có thể được cài nhiều lần với các release khác nhau:

```bash
helm install nginx-dev ./nginx
helm install nginx-prod ./nginx
```

Khi đó `nginx-dev` và `nginx-prod` là hai release khác nhau.

### 3.3. Values

Values là dữ liệu cấu hình truyền vào Helm Chart. File phổ biến nhất là `values.yaml`.

Ví dụ:

```yaml
replicaCount: 2

image:
  repository: nginx
  tag: "1.25"

service:
  type: ClusterIP
  port: 80
```

Template trong thư mục `templates/` sẽ đọc các giá trị này thông qua `.Values`.

### 3.4. Template

Template là manifest Kubernetes có chứa biến Helm.

Ví dụ:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
```

Khi chạy `helm install` hoặc `helm template`, Helm sẽ render template thành manifest Kubernetes hoàn chỉnh.

---

## 4. Cấu trúc thư mục Helm Chart

Cấu trúc cơ bản:

```text
my-app/
  Chart.yaml
  values.yaml
  templates/
    deployment.yaml
    service.yaml
    ingress.yaml
    configmap.yaml
    _helpers.tpl
  charts/
  crds/
  README.md
```

Ý nghĩa từng thành phần:

| Thành phần | Ý nghĩa |
|---|---|
| `Chart.yaml` | Chứa thông tin metadata của Chart như tên, version, appVersion |
| `values.yaml` | Chứa giá trị mặc định cho Chart |
| `templates/` | Chứa các manifest Kubernetes dạng template |
| `_helpers.tpl` | Chứa các helper template dùng lại nhiều lần |
| `charts/` | Chứa dependency chart/subchart |
| `crds/` | Chứa CustomResourceDefinition nếu Chart cần cài CRD |
| `README.md` | Tài liệu mô tả cách dùng Chart |

---

## 5. Tạo Helm Chart mới

Có thể tạo chart mẫu bằng lệnh:

```bash
helm create my-app
```

Sau khi chạy, Helm tạo ra cấu trúc mặc định:

```text
my-app/
  Chart.yaml
  values.yaml
  charts/
  templates/
    deployment.yaml
    service.yaml
    ingress.yaml
    serviceaccount.yaml
    hpa.yaml
    _helpers.tpl
```

Trong thực tế, không nhất thiết giữ toàn bộ file mặc định. Nên xóa hoặc sửa các file không dùng để Chart gọn và dễ hiểu hơn.

---

## 6. File Chart.yaml

`Chart.yaml` là file bắt buộc trong Helm Chart.

Ví dụ:

```yaml
apiVersion: v2
name: my-app
description: A Helm chart for deploying my-app on Kubernetes
type: application
version: 0.1.0
appVersion: "1.0.0"
```

Ý nghĩa:

| Trường | Ý nghĩa |
|---|---|
| `apiVersion` | Phiên bản API của Helm Chart, Helm 3 thường dùng `v2` |
| `name` | Tên Chart |
| `description` | Mô tả Chart |
| `type` | Loại Chart, thường là `application` |
| `version` | Version của Chart |
| `appVersion` | Version của ứng dụng được triển khai |

Phân biệt:

- `version`: version của Helm Chart.
- `appVersion`: version của ứng dụng/container image.

Ví dụ nếu sửa logic template thì tăng `version`. Nếu chỉ đổi image app từ `1.0.0` lên `1.0.1`, có thể tăng `appVersion`.

---

## 7. File values.yaml

`values.yaml` chứa cấu hình mặc định cho Chart. Đây là file rất quan trọng vì giúp tách cấu hình ra khỏi template.

Ví dụ:

```yaml
replicaCount: 2

image:
  repository: nginx
  tag: "1.25"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 80

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

ingress:
  enabled: false
  className: nginx
  host: my-app.example.com
  tls:
    enabled: false
    secretName: my-app-tls
```

Khi cài Chart, có thể override value bằng file khác:

```bash
helm install my-app ./my-app -f values-uat.yaml
```

Hoặc override trực tiếp bằng `--set`:

```bash
helm install my-app ./my-app --set replicaCount=3
```

---

## 8. Viết template Deployment

Ví dụ file `templates/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-app.fullname" . }}
  labels:
    app.kubernetes.io/name: {{ include "my-app.name" . }}
    app.kubernetes.io/instance: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ include "my-app.name" . }}
      app.kubernetes.io/instance: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ include "my-app.name" . }}
        app.kubernetes.io/instance: {{ .Release.Name }}
    spec:
      containers:
        - name: {{ include "my-app.name" . }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: {{ .Values.service.targetPort }}
          resources:
{{ toYaml .Values.resources | indent 12 }}
```

Điểm cần chú ý:

- `.Values.replicaCount` lấy giá trị từ `values.yaml`.
- `.Values.image.repository` lấy repository image.
- `.Values.image.tag` lấy tag image.
- `toYaml` dùng để render object YAML.
- `indent` dùng để căn lề YAML cho đúng.

---

## 9. Viết template Service

Ví dụ file `templates/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "my-app.fullname" . }}
  labels:
    app.kubernetes.io/name: {{ include "my-app.name" . }}
    app.kubernetes.io/instance: {{ .Release.Name }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.targetPort }}
      protocol: TCP
      name: http
  selector:
    app.kubernetes.io/name: {{ include "my-app.name" . }}
    app.kubernetes.io/instance: {{ .Release.Name }}
```

Service dùng selector để trỏ tới Pod do Deployment tạo ra. Vì vậy label ở Deployment và selector của Service phải khớp nhau.

---

## 10. Viết template Ingress

Ví dụ file `templates/ingress.yaml`:

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "my-app.fullname" . }}
  annotations:
{{ toYaml .Values.ingress.annotations | indent 4 }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  {{- if .Values.ingress.tls.enabled }}
  tls:
    - hosts:
        - {{ .Values.ingress.host }}
      secretName: {{ .Values.ingress.tls.secretName }}
  {{- end }}
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "my-app.fullname" . }}
                port:
                  number: {{ .Values.service.port }}
{{- end }}
```

Trong ví dụ này:

- Nếu `ingress.enabled=false`, Helm không render Ingress.
- Nếu `ingress.tls.enabled=true`, Helm render thêm phần TLS.
- Host và secretName được lấy từ `values.yaml`.

---

## 11. Viết _helpers.tpl

File `_helpers.tpl` dùng để định nghĩa template dùng lại nhiều lần.

Ví dụ:

```yaml
{{- define "my-app.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "my-app.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
```

Khi cần dùng trong template:

```yaml
name: {{ include "my-app.fullname" . }}
```

Lợi ích:

- Tránh lặp lại logic đặt tên.
- Chuẩn hóa label/name.
- Dễ bảo trì khi Chart lớn.

---

## 12. Kiểm tra Helm Chart

### 12.1. Kiểm tra syntax và convention

```bash
helm lint ./my-app
```

Lệnh này kiểm tra Chart có lỗi cơ bản hay không.

### 12.2. Render manifest ra YAML

```bash
helm template my-app ./my-app
```

Nếu muốn render theo namespace:

```bash
helm template my-app ./my-app -n my-namespace
```

Nếu muốn dùng file values riêng:

```bash
helm template my-app ./my-app -f values-uat.yaml
```

### 12.3. Dry-run trước khi install

```bash
helm install my-app ./my-app -n my-namespace --dry-run --debug
```

Dry-run giúp xem manifest Helm sẽ apply mà chưa tạo resource thật.

---

## 13. Cài đặt Helm Chart

Tạo namespace:

```bash
kubectl create namespace my-namespace
```

Cài Chart:

```bash
helm install my-app ./my-app -n my-namespace
```

Kiểm tra release:

```bash
helm list -n my-namespace
```

Kiểm tra resource:

```bash
kubectl get all -n my-namespace
```

---

## 14. Upgrade Helm Release

Khi thay đổi Chart hoặc values, dùng:

```bash
helm upgrade my-app ./my-app -n my-namespace
```

Nếu vừa muốn install nếu chưa tồn tại, vừa upgrade nếu đã tồn tại:

```bash
helm upgrade --install my-app ./my-app -n my-namespace
```

Dùng values riêng:

```bash
helm upgrade --install my-app ./my-app -n my-namespace -f values-uat.yaml
```

Override nhanh bằng `--set`:

```bash
helm upgrade my-app ./my-app -n my-namespace --set replicaCount=3
```

---

## 15. Rollback Helm Release

Xem lịch sử release:

```bash
helm history my-app -n my-namespace
```

Rollback về revision trước:

```bash
helm rollback my-app 1 -n my-namespace
```

Kiểm tra lại:

```bash
helm status my-app -n my-namespace
kubectl get pods -n my-namespace
```

---

## 16. Gỡ Helm Release

Gỡ release:

```bash
helm uninstall my-app -n my-namespace
```

Lưu ý: một số resource như PVC có thể không bị xóa tùy `reclaimPolicy` hoặc annotation/resource policy.

---

## 17. Ví dụ values cho môi trường UAT

Ví dụ `values-uat.yaml`:

```yaml
replicaCount: 2

image:
  repository: registry.local/my-app
  tag: "1.0.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 8080

resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: "1"
    memory: 1Gi

ingress:
  enabled: true
  className: nginx
  host: my-app-uat.example.local
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
  tls:
    enabled: true
    secretName: my-app-uat-tls
```

Cài đặt:

```bash
helm upgrade --install my-app ./my-app -n my-namespace -f values-uat.yaml
```

---

## 18. Một số lỗi thường gặp

### 18.1. Lỗi YAML indentation

Triệu chứng:

```text
yaml: line x: did not find expected key
```

Nguyên nhân thường do sai căn lề khi dùng `toYaml`, `indent`, `nindent`.

Cách xử lý:

```bash
helm template my-app ./my-app --debug
```

Kiểm tra manifest render ra có đúng YAML không.

### 18.2. Service không trỏ được Pod

Nguyên nhân thường là selector của Service không khớp label của Pod.

Kiểm tra:

```bash
kubectl get svc -n my-namespace
kubectl get endpoints -n my-namespace
kubectl get pods -n my-namespace --show-labels
```

### 18.3. Ingress không truy cập được

Cần kiểm tra:

```bash
kubectl get ingress -n my-namespace
kubectl describe ingress my-app -n my-namespace
kubectl get svc -n my-namespace
kubectl get endpoints -n my-namespace
```

Các nguyên nhân thường gặp:

- Sai ingressClassName.
- Sai host.
- Sai service name hoặc service port.
- TLS secret chưa tồn tại.
- DNS chưa trỏ về ingress controller.

### 18.4. Resource bị Helm ghi đè

Nếu resource do Helm quản lý, không nên sửa trực tiếp bằng `kubectl edit` lâu dài. Lần `helm upgrade` sau có thể ghi đè lại.

Cách đúng:

- Sửa `values.yaml`.
- Sửa template.
- Chạy `helm upgrade`.

---

## 19. Best practice khi viết Helm Chart

Một số nguyên tắc nên áp dụng:

1. Tách cấu hình ra `values.yaml`, không hard-code quá nhiều trong template.
2. Đặt tên resource nhất quán bằng `_helpers.tpl`.
3. Mỗi loại resource nên có một file template riêng.
4. Luôn chạy `helm lint` và `helm template` trước khi install/upgrade.
5. Không để Secret nhạy cảm trực tiếp trong Git nếu không có cơ chế mã hóa.
6. Luôn có `resources.requests` và cân nhắc `resources.limits`.
7. Với môi trường airgap, image repository phải trỏ về private registry.
8. Không upgrade chart/version cùng lúc với nhiều thay đổi lớn nếu không có rollback plan.
9. Dùng file values riêng cho từng môi trường: `values-dev.yaml`, `values-uat.yaml`, `values-prod.yaml`.
10. Ghi rõ hướng dẫn install/upgrade/rollback trong `README.md`.

---

## 20. Quy trình xây dựng Helm Chart chuẩn

Quy trình đề xuất:

```text
Bước 1: Viết manifest Kubernetes chạy được bằng kubectl.
Bước 2: Tạo Helm Chart bằng helm create.
Bước 3: Đưa các manifest vào thư mục templates.
Bước 4: Tách các giá trị thay đổi sang values.yaml.
Bước 5: Dùng biến .Values trong template.
Bước 6: Chuẩn hóa tên resource bằng _helpers.tpl.
Bước 7: Chạy helm lint.
Bước 8: Chạy helm template để kiểm tra manifest render.
Bước 9: Cài thử bằng helm install --dry-run --debug.
Bước 10: Cài thật vào namespace test.
Bước 11: Kiểm tra pod/service/ingress.
Bước 12: Viết README hướng dẫn sử dụng Chart.
```

---

## 21. Kết luận

Helm Chart giúp đóng gói, chuẩn hóa và tái sử dụng manifest Kubernetes. Khi viết Helm Chart, cần nắm rõ ba phần chính:

```text
Chart.yaml   → thông tin Chart
values.yaml  → cấu hình mặc định
templates/   → manifest Kubernetes dạng template
```

Đối với môi trường vận hành thực tế như Rancher/RKE2 hoặc airgap, Helm đặc biệt hữu ích vì giúp quản lý version, rollback và chuẩn hóa cấu hình giữa các môi trường.

Tuy nhiên, Helm cũng có rủi ro nếu sử dụng không đúng cách. Không nên chỉnh sửa trực tiếp resource do Helm quản lý mà không cập nhật lại Chart/values. Trước khi install hoặc upgrade, nên luôn chạy `helm lint`, `helm template` và `--dry-run --debug` để giảm rủi ro lỗi YAML hoặc lỗi cấu hình.

---

## 22. Tài liệu tham khảo

- Helm Docs - Charts: https://helm.sh/docs/topics/charts/
- Helm Docs - Chart Template Guide: https://helm.sh/docs/chart_template_guide/
- Helm Docs - Values Files: https://helm.sh/docs/chart_template_guide/values_files/
- Helm Docs - helm lint: https://helm.sh/docs/helm/helm_lint/
