# Giải pháp Horizontal Pod Autoscaler (HPA)

## 1. Mục tiêu

Horizontal Pod Autoscaler (HPA) tự động tăng hoặc giảm số lượng Pod theo tải
thực tế. Giải pháp giúp:

- Tăng khả năng đáp ứng khi tải cao.
- Giảm tài nguyên sử dụng khi tải thấp.
- Hạn chế thao tác scale thủ công.

HPA chỉ thay đổi số Pod, không tự tăng số node. Cluster phải còn đủ CPU và
memory để chạy Pod mới.

## 2. Cách hoạt động

HPA là một controller của Kubernetes. Controller này chạy theo chu kỳ, đọc
metric của các Pod thuộc Deployment rồi điều chỉnh trường `replicas`.

Luồng hoạt động:

![HPA](/docs/HPA/images/HPA.png)

HPA thường scale theo:

- CPU.
- Memory.
- Custom metric như request/giây hoặc độ dài queue.

Nên bắt đầu bằng CPU vì dễ triển khai. Chỉ dùng custom metric khi CPU không phản
ánh đúng tải của ứng dụng.

### Cách HPA tính số Pod

HPA dùng công thức:

`Số Pod mong muốn = ceil(Số Pod hiện tại x Metric hiện tại / Metric mục tiêu)`

Ví dụ:

- Deployment đang chạy 2 Pod.
- CPU trung bình hiện tại là 90% so với CPU request.
- CPU mục tiêu trong HPA là 60%.

Kết quả:

```text
ceil(2 x 90 / 60) = 3 Pod
```

HPA sẽ yêu cầu Deployment tăng từ 2 lên 3 Pod.

CPU utilization được tính dựa trên `requests.cpu`. Ví dụ container có CPU
request `200m` và đang dùng `130m` thì CPU utilization là:

```text
130m / 200m x 100 = 65%
```

Vì vậy, đặt CPU request không chính xác sẽ khiến HPA scale sai thời điểm.

### Khi tải tăng

1. Metrics Server ghi nhận CPU của các Pod tăng.
2. HPA tính số replica cần thiết.
3. HPA cập nhật số replica của Deployment.
4. Deployment tạo Pod mới.
5. Scheduler chọn node còn đủ tài nguyên.
6. Pod mới chỉ nhận traffic sau khi readiness probe thành công.

### Khi tải giảm

1. HPA ghi nhận metric thấp hơn ngưỡng.
2. HPA chờ hết `stabilizationWindowSeconds`.
3. HPA giảm replica theo giới hạn trong `scaleDown.policies`.
4. Deployment dừng Pod dư thừa.

Khoảng chờ scale-down giúp tránh việc số Pod tăng giảm liên tục khi tải dao
động trong thời gian ngắn.

Nếu khai báo nhiều metric, HPA tính số replica cho từng metric và chọn kết quả
lớn nhất. Ví dụ CPU yêu cầu 3 Pod nhưng memory yêu cầu 5 Pod thì HPA sẽ chọn 5
Pod.

## 3. Điều kiện triển khai

### Metrics Server hoạt động

Kiểm tra:

```bash
kubectl get apiservice v1beta1.metrics.k8s.io
kubectl top nodes
kubectl top pods -A
```

Nếu `kubectl top` không trả về dữ liệu, cần kiểm tra hoặc cài Metrics Server
trước khi tạo HPA.

### Deployment có resource requests

HPA tính CPU utilization dựa trên `requests.cpu`, không phải `limits.cpu`:

```yaml
resources:
  requests:
    cpu: 200m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi
```

Nếu không có CPU request, HPA không thể tính đúng CPU utilization.

### Ứng dụng chạy được nhiều replica

Cần bảo đảm:

- Session và dữ liệu dùng chung không lưu riêng trong một Pod.
- Cron job hoặc background job không bị chạy trùng ngoài ý muốn.
- Database và các dịch vụ phụ thuộc chịu được nhiều kết nối hơn.
- Readiness probe chỉ cho phép Pod nhận traffic khi đã sẵn sàng.
- Ứng dụng xử lý `SIGTERM` để không làm gián đoạn request khi scale-down.

## 4. Cấu hình đề xuất

Giá trị khởi đầu:

| Tham số | Giá trị đề xuất |
| --- | --- |
| `minReplicas` | `2` |
| `maxReplicas` | `6` đến `10` |
| CPU target | `65%` |
| Scale-down stabilization | `300` giây |

Các giá trị trên cần được điều chỉnh sau khi load test và theo dõi thực tế.

## 5. Manifest HPA mẫu

### HPA cho `cmp-portal`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cmp-portal
  namespace: cmp-portal-dev
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cmp-portal
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
```

### HPA cho backend

Đổi `name` thành `cmp-ams` hoặc `cmp-billing`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cmp-ams
  namespace: cmp-backend-dev
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cmp-ams
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
```

Scale-up được cấu hình nhanh để xử lý tải tăng. Scale-down chỉ giảm tối đa một
Pod mỗi phút và chờ 5 phút để tránh số replica dao động liên tục.

## 6. Triển khai và kiểm tra

Áp dụng HPA:

```bash
kubectl apply -f hpa.yaml
kubectl -n cmp-backend-dev get hpa
kubectl -n cmp-backend-dev describe hpa cmp-ams
```

Theo dõi khi tạo tải:

```bash
kubectl -n cmp-backend-dev get hpa cmp-ams --watch
kubectl -n cmp-backend-dev get pods -l app=cmp-ams --watch
kubectl top pods -n cmp-backend-dev
```

Kết quả mong đợi:

1. CPU vượt ngưỡng thì số Pod tăng.
2. Pod mới chuyển sang trạng thái Ready và nhận traffic.
3. Khi tải giảm, HPA chờ 5 phút rồi giảm Pod từ từ.
4. Không có Pod ở trạng thái Pending hoặc lỗi.

## 7. Lưu ý vận hành

### Không để GitOps ghi đè replica

Sau khi HPA quản lý Deployment, nên bỏ `spec.replicas` khỏi manifest Deployment
hoặc cấu hình công cụ GitOps bỏ qua trường này. Nếu không, mỗi lần đồng bộ có
thể ghi đè số replica do HPA đặt.

### Bảo đảm cluster còn tài nguyên

Nếu HPA tăng Pod nhưng node không đủ tài nguyên, Pod sẽ ở trạng thái `Pending`.
Cần duy trì tài nguyên dự phòng hoặc triển khai Cluster Autoscaler.

### Không áp dụng trực tiếp cho Redis

Redis là workload stateful. Việc scale Redis liên quan đến replication, quorum,
Sentinel và lưu trữ nên không được thực hiện chỉ bằng HPA.

### Theo dõi dịch vụ phụ thuộc

Tăng Pod cũng làm tăng số kết nối tới database, Redis và API khác. Cần đặt
`maxReplicas` phù hợp với giới hạn của toàn hệ thống, không chỉ của Kubernetes.

## 8. Xử lý lỗi nhanh

| Hiện tượng | Kiểm tra |
| --- | --- |
| HPA hiển thị `<unknown>` | Metrics Server và resource requests |
| CPU cao nhưng không scale | CPU utilization so với `requests.cpu` |
| Pod mới bị `Pending` | Tài nguyên node, taint và affinity |
| Replica tăng giảm liên tục | Tăng stabilization window, kiểm tra request |
| Scale-out không giảm độ trễ | Kiểm tra database và dịch vụ downstream |

Các lệnh hỗ trợ:

```bash
kubectl describe hpa -n <namespace> <hpa-name>
kubectl top pods -n <namespace>
kubectl get events -n <namespace> --sort-by=.lastTimestamp
```

## 9. Khuyến nghị cho hệ thống hiện tại

- `cmp-portal`: bắt đầu với 2 đến 6 Pod, CPU target `65%`.
- `cmp-ams`: bắt đầu với 2 đến 10 Pod, CPU target `65%`.
- `cmp-billing`: bắt đầu với 2 đến 10 Pod, CPU target `65%`.
- Kiểm thử tải tại môi trường dev/UAT trước khi áp dụng production.
- Theo dõi CPU, latency, error rate và số kết nối database.
- Điều chỉnh CPU target và `maxReplicas` dựa trên kết quả kiểm thử.

## 10. Kết luận

Nên triển khai HPA bằng `autoscaling/v2`, scale theo CPU trong giai đoạn đầu và
giữ tối thiểu hai replica cho workload cần tính sẵn sàng cao. Hiệu quả của HPA
phụ thuộc vào resource requests chính xác, ứng dụng hỗ trợ nhiều replica và
cluster còn đủ tài nguyên.
