# Báo cáo rà soát và tối ưu tài nguyên Rancher/RKE2 Cluster

## 1. Mục tiêu

Thực hiện rà soát hiện trạng sử dụng tài nguyên của cụm RKE2/Rancher nhằm xác định các thành phần tiêu thụ RAM lớn, đánh giá nguyên nhân gây tăng tài nguyên và đề xuất phương án tối ưu an toàn, không ảnh hưởng đến hoạt động hiện tại của cluster.

Phạm vi rà soát tập trung vào các thành phần chính:

```text
- Rancher core
- kube-apiserver trên các node control-plane
- Rancher Monitoring / Prometheus
- Longhorn
- ELK stack
- Các workload ứng dụng như Keycloak, PostgreSQL, RustFS, Pyroscope
```

## 2. Hiện trạng tài nguyên

Dựa trên kết quả `kubectl top pods -A`, cụm hiện có một số nhóm workload đang sử dụng RAM cao. Đáng chú ý nhất là Rancher, kube-apiserver, Rancher Monitoring, Longhorn và ELK. 

### 2.1. Rancher core

Rancher hiện đang chạy 3 pod trong namespace `cattle-system`:

```text
rancher-779bb7c476-jc54r   ~2458Mi
rancher-779bb7c476-lrn6b   ~1934Mi
rancher-779bb7c476-zkkmg   ~1907Mi
```

Tổng RAM Rancher đang sử dụng xấp xỉ **6.3Gi**. Đây là mức tương đối cao, nhưng không bất thường đối với cụm có nhiều CRD, operator, monitoring, storage và workload đang chạy.

Nhận xét:

```text
- Mỗi pod Rancher đang sử dụng khoảng 1.9Gi – 2.4Gi RAM.
- Không nên đặt memory limit quá thấp, đặc biệt không nên đặt 1Gi.
- Nếu đặt limit thấp hơn mức sử dụng thực tế, pod Rancher có nguy cơ bị OOMKilled.
```

### 2.2. kube-apiserver

Các pod kube-apiserver trên control-plane đang sử dụng RAM ở mức cao:

```text
kube-apiserver-cp1   ~2356Mi
kube-apiserver-cp2   ~2173Mi
kube-apiserver-cp3   ~1951Mi
```

Tổng RAM của nhóm kube-apiserver khoảng **6.4Gi**.

Nguyên nhân chính:

```text
- Cluster có nhiều CRD và operator.
- Rancher, Longhorn, Kyverno, Monitoring, PostgreSQL Operator, ELK đều tạo nhiều object và watch/list request.
- kube-apiserver phải duy trì cache, watch connection và xử lý nhiều request từ controller.
```

Nhận xét:

```text
- Không nên tối ưu kube-apiserver bằng cách bóp memory limit.
- Nếu set limit thấp, control-plane có thể chập chờn hoặc API server restart.
- Nên tối ưu gián tiếp bằng cách giảm event spam, giảm workload/operator không cần thiết và kiểm tra các watcher gây tải cao.
```

### 2.3. Rancher Monitoring / Prometheus

Nhóm monitoring cũng tiêu thụ tài nguyên đáng kể:

```text
prometheus-rancher-monitoring-prometheus-0        ~1576Mi
rancher-monitoring-prometheus-adapter             ~805Mi
rancher-monitoring-grafana                        ~296Mi
```

Nhận xét:

```text
- Prometheus là thành phần tiêu thụ RAM và disk lớn theo thời gian.
- Prometheus Adapter cũng đang dùng RAM khá cao.
- Cần tối ưu retention, retentionSize và các rule/scrape target không cần thiết.
```

### 2.4. Longhorn

Longhorn có các pod `instance-manager` sử dụng RAM cao:

```text
instance-manager-*   khoảng 729Mi – 787Mi mỗi pod
```

Nhận xét:

```text
- Longhorn liên quan trực tiếp tới PVC/volume của workload.
- Không nên bóp tài nguyên Longhorn instance-manager tùy tiện.
- Nếu instance-manager bị OOMKilled, workload dùng PVC có thể bị ảnh hưởng.
```

### 2.5. ELK Stack

ELK là một trong các nhóm workload ứng dụng tiêu thụ RAM lớn:

```text
elasticsearch-master-0      ~2340Mi
logstash-dung-logstash-0    ~1426Mi
kibana-dung-kibana          ~382Mi
```

Nhận xét:

```text
- Elasticsearch và Logstash là workload JVM, cần tối ưu bằng JVM heap.
- Chỉ set Kubernetes limit mà không cấu hình heap có thể gây OOM hoặc hiệu năng không ổn định.
```

## 3. Phân tích nguyên nhân

### 3.1. Rancher dùng RAM cao

Rancher tăng RAM không chỉ do người dùng mở Rancher UI nhiều. Việc sử dụng UI có thể làm CPU/RAM tăng tạm thời, nhưng nguyên nhân chính thường là Rancher phải watch và cache nhiều tài nguyên Kubernetes.

Các yếu tố làm Rancher nặng:

```text
- Nhiều namespace, pod, secret, configmap, service.
- Nhiều CRD từ Rancher, Longhorn, Kyverno, Monitoring, PostgreSQL Operator.
- Nhiều event hoặc workload lỗi liên tục.
- Tích hợp Fleet/GitOps, Monitoring, webhook, RBAC, project/role.
- Cluster có nhiều controller liên tục reconcile.
```

Kết luận: Rancher dùng RAM cao chủ yếu do độ phức tạp của cluster, không chỉ do thao tác trên UI.

### 3.2. kube-apiserver dùng RAM cao

kube-apiserver đang sử dụng nhiều RAM do phải xử lý nhiều `LIST`, `WATCH`, `GET`, event và cache object. Đây là đặc điểm thường gặp ở các cluster có Rancher, monitoring, storage operator và policy engine.

Không nên coi kube-apiserver là đối tượng đầu tiên để bóp resource. Cần kiểm tra nguyên nhân tải trước, ví dụ:

```bash
kubectl get events -A --sort-by=.metadata.creationTimestamp | tail -100

kubectl get --raw /metrics | grep apiserver_registered_watchers | sort -k2 -nr | head -30
```

### 3.3. Monitoring và ELK cần tối ưu riêng

Prometheus nên tối ưu bằng retention và retentionSize. ELK nên tối ưu bằng JVM heap. Đây là hai nhóm không nên chỉ xử lý bằng cách đặt limit thấp.

## 4. Đề xuất tối ưu

### 4.1. Đối với Rancher

Phương án đề xuất cho môi trường UAT/lab:

```yaml
replicas: 2

resources:
  requests:
    cpu: 500m
    memory: 1Gi
  limits:
    cpu: "2"
    memory: 3Gi
```

Lý do:

```text
- Giảm Rancher từ 3 replica xuống 2 replica giúp giảm ngay khoảng 2Gi RAM.
- request memory 1Gi giúp scheduler đặt pod hợp lý hơn.
- limit memory 3Gi đủ an toàn vì pod cao nhất hiện khoảng 2.4Gi.
- Không nên đặt limit 1Gi hoặc 1.5Gi vì rủi ro OOMKilled cao.
```

Nếu ưu tiên ổn định hơn kiểm soát RAM, có thể chỉ đặt request và không đặt memory limit:

```yaml
resources:
  requests:
    cpu: 500m
    memory: 1Gi
```

### 4.2. Đối với kube-apiserver

Không khuyến nghị đặt limit thấp cho kube-apiserver.

Hướng xử lý phù hợp:

```text
- Kiểm tra event spam.
- Kiểm tra số lượng object trong cluster.
- Kiểm tra controller/operator tạo nhiều watch request.
- Dọn workload/operator không dùng.
- Giảm event TTL nếu cần.
```

Ví dụ kiểm tra số lượng object:

```bash
kubectl get pods -A --no-headers | wc -l
kubectl get secrets -A --no-headers | wc -l
kubectl get configmaps -A --no-headers | wc -l
kubectl get crd --no-headers | wc -l
kubectl get events -A --no-headers | wc -l
```

### 4.3. Đối với Prometheus / Rancher Monitoring

Đề xuất giảm retention:

```yaml
retention: 3d
retentionSize: 6GB
```

Nếu patch trực tiếp Prometheus CR:

```bash
kubectl -n cattle-monitoring-system patch prometheus rancher-monitoring-prometheus \
  --type merge \
  -p '{"spec":{"retention":"3d","retentionSize":"6GB"}}'
```

Sau đó restart pod Prometheus:

```bash
kubectl -n cattle-monitoring-system delete pod prometheus-rancher-monitoring-prometheus-0
```

### 4.4. Đối với Longhorn

Không nên bóp tài nguyên Longhorn instance-manager khi chưa đánh giá kỹ volume đang chạy.

Hướng kiểm tra:

```bash
kubectl -n longhorn-system get pods
kubectl -n longhorn-system get volumes.longhorn.io
```

Nếu môi trường lab/UAT và chấp nhận giảm HA storage, có thể xem xét giảm replica count của volume mới từ 3 xuống 2. Tuy nhiên cần đánh giá kỹ trước khi áp dụng.

### 4.5. Đối với ELK

Cần tối ưu JVM heap cho Elasticsearch và Logstash.

Ví dụ định hướng:

```yaml
Elasticsearch:
  container memory limit: 2Gi
  JVM heap: -Xms1g -Xmx1g

Logstash:
  container memory limit: 1Gi
  JVM heap: -Xms512m -Xmx512m
```

Không nên chỉ set Kubernetes limit mà bỏ qua heap JVM.

## 5. Phương án thực hiện Rancher

### 5.1. Patch trực tiếp để test nhanh

Có thể patch trực tiếp Deployment Rancher để kiểm thử:

```bash
kubectl -n cattle-system patch deployment rancher \
  --type='json' \
  -p='[
    {
      "op": "add",
      "path": "/spec/template/spec/containers/0/resources",
      "value": {
        "requests": {
          "cpu": "500m",
          "memory": "1Gi"
        },
        "limits": {
          "cpu": "2",
          "memory": "3Gi"
        }
      }
    }
  ]'
```

Giảm replica:

```bash
kubectl -n cattle-system scale deployment rancher --replicas=2
```

Theo dõi rollout:

```bash
kubectl -n cattle-system rollout status deploy/rancher
kubectl -n cattle-system get pods -o wide
kubectl -n cattle-system top pods
```

### 5.2. Lưu cấu hình lâu dài bằng Helm

Do Rancher được quản lý bằng Helm, patch trực tiếp chỉ nên dùng để test. Nếu cấu hình ổn định, cần ghi lại bằng Helm values.

Với môi trường airgap, không dùng chart online bừa. Cần dùng đúng chart `.tgz` local đang cài và giữ nguyên các value hiện tại như:

```text
- hostname
- systemDefaultRegistry
- privateCA
- ingress.tls.source
- useBundledSystemChart nếu đang dùng
```

Tạo file override:

```bash
cat > /root/rancher-resource-limit.yaml <<'EOF'
replicas: 2

resources:
  requests:
    cpu: 500m
    memory: 1Gi
  limits:
    cpu: "2"
    memory: 3Gi
EOF
```

Upgrade bằng chart local đúng version:

```bash
helm upgrade rancher /path/to/rancher-<current-version>.tgz \
  -n cattle-system \
  --reuse-values \
  -f /root/rancher-resource-limit.yaml
```

## 6. Rủi ro và lưu ý

### 6.1. Không nên làm

```text
- Không set Rancher memory limit 1Gi.
- Không bóp limit kube-apiserver.
- Không bóp Longhorn instance-manager tùy tiện.
- Không upgrade Rancher bằng chart online nếu cụm đang airgap.
- Không đổi version Rancher trong lúc chỉ muốn thêm resource limit.
- Không chỉnh nhiều thứ cùng lúc khiến khó rollback.
```

### 6.2. Cần theo dõi sau khi thay đổi

```bash
kubectl -n cattle-system get pods
kubectl -n cattle-system top pods
kubectl -n cattle-system get events --sort-by=.metadata.creationTimestamp | tail -30
kubectl top nodes
```

Nếu Rancher bị `OOMKilled`, cần tăng limit lên 4Gi hoặc bỏ memory limit:

```bash
kubectl -n cattle-system patch deployment rancher \
  --type='json' \
  -p='[
    {
      "op": "replace",
      "path": "/spec/template/spec/containers/0/resources/limits/memory",
      "value": "4Gi"
    }
  ]'
```

## 7. Kết quả rà soát

Kết quả rà soát cho thấy các thành phần tiêu thụ RAM chính trong cụm gồm:

```text
1. Rancher core
2. kube-apiserver
3. Rancher Monitoring / Prometheus
4. Longhorn
5. ELK
```

Rancher hiện đang sử dụng tổng khoảng **6.3Gi RAM** với 3 replica. kube-apiserver sử dụng tổng khoảng **6.4Gi RAM** trên 3 control-plane. Prometheus, Prometheus Adapter, Longhorn instance-manager và ELK cũng là các nhóm tiêu thụ tài nguyên đáng kể. 

Phương án tối ưu được đề xuất:

```text
- Giảm Rancher từ 3 replica xuống 2 replica nếu môi trường UAT/lab không yêu cầu HA đầy đủ.
- Đặt request cho Rancher để scheduler quản lý tài nguyên tốt hơn.
- Nếu cần limit, đặt memory limit ở mức 3Gi/pod thay vì 1Gi hoặc 1.5Gi.
- Không bóp kube-apiserver và Longhorn bằng limit thấp.
- Tối ưu Prometheus bằng retention/retentionSize.
- Tối ưu ELK bằng JVM heap.
```

## 8. Kết luận

Việc tiêu thụ RAM cao trong cụm không đến từ một thành phần đơn lẻ mà đến từ tổng thể kiến trúc đang chạy nhiều hệ thống nền tảng: Rancher, Monitoring, Longhorn, Kyverno, ELK, PostgreSQL Operator và các workload ứng dụng.

Đối với Rancher, hướng tối ưu an toàn nhất là **giảm số replica từ 3 xuống 2** và đặt resource request/limit ở mức phù hợp. Không nên đặt memory limit quá thấp vì sẽ gây rủi ro `OOMKilled`.

Cấu hình đề xuất ban đầu:

```yaml
replicas: 2

resources:
  requests:
    cpu: 500m
    memory: 1Gi
  limits:
    cpu: "2"
    memory: 3Gi
```

Sau khi áp dụng cần theo dõi pod Rancher, event, restart count và mức sử dụng RAM thực tế. Nếu ổn định, cấu hình cần được lưu lại bằng Helm values sử dụng đúng chart local airgap hiện tại.
