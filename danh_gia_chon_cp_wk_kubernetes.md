# Báo cáo đánh giá tài nguyên và đề xuất phân vai CP/WK cho Kubernetes cluster

## 1. Kết luận đề xuất

Đề xuất chính theo tiêu chí tài nguyên: dùng mô hình **3 control-plane + 3 worker**.

| Role | IP | Hostname | Lý do chính |
|---|---|---|---|
| CP | 172.23.0.47 | kubernetes-web02 | CPU/disk ổn nhưng RAM chỉ 7.7Gi; phù hợp CP khi để WK có 15Gi chạy Workload. |
| CP | 172.23.0.48 | Kubernetes-web03 | Tài nguyên giống 172.23.0.47 |
| CP | 172.23.0.24 | monitoring-web02 | Tương tự với lượng RAM thấp hơn|
| WK | 172.23.0.46 | Kubernetes-web01 | RAM cao 15Gi, CPU 8 vCPU, disk root còn 65G, lượng RAM lớn dùng làm WK để chạy Workload. |
| WK | 172.23.0.49 | monitoring-web01 | RAM cao 15Gi. |
| WK | 172.23.0.28 | sonarqube-web | RAM cao 15Gi và CPU 8 vCPU; disk logical nhỏ hơn nhóm 198G nhưng root còn 65G. |


## 2. Bảng so sánh tài nguyên

| IP | Hostname | CPU | RAM | Root disk | Kernel | Uptime | Đề xuất |
|---|---|---|---|---|---|---|---|
| 172.23.0.46 | Kubernetes-web01 | 8 vCPU | 15Gi total / 14Gi available | 77G / 65G avail / 12% used | 5.15.0-176-generic | 2w 5d | Wk |
| 172.23.0.47 | kubernetes-web02 | 8 vCPU | 7.7Gi total / 7.0Gi available | 77G / 64G avail / 12% used | 5.15.0-171-generic | 4w 6d | CP |
| 172.23.0.48 | Kubernetes-web03 | 8 vCPU | 7.7Gi total / 7.0Gi available | 77G / 64G avail / 12% used | 5.15.0-171-generic | 4w 6d | CP |
| 172.23.0.49 | monitoring-web01 | 8 vCPU | 15Gi total / 14Gi available | 77G / 65G avail / 12% used | 5.15.0-176-generic | 2w 5d | WK |
| 172.23.0.24 | monitoring-web02 | 8 vCPU | 7.7Gi total / 7.0Gi available | 77G / 65G avail / 12% used | 5.15.0-173-generic | 4w 6d | CP |
| 172.23.0.28 | sonarqube-web | 8 vCPU | 15Gi total / 14Gi available | 77G / 65G avail / 12% used | 5.15.0-176-generic | 2w 5d | WK |

## 3. Nhận xét kỹ thuật

- CPU bằng nhau: toàn bộ 6 VM đều có 8 vCPU Intel Xeon E5-2697 v4.
- RAM là yếu tố phân loại rõ nhất: 172.23.0.46, 172.23.0.49 và 172.23.0.28 có 15Gi RAM; ba máy còn lại chỉ 7.7Gi RAM.
- Root filesystem của các máy đều còn khoảng 64-65G trống, đủ cho control-plane cơ bản; riêng 172.23.0.28 có LV hiển thị 98G, thấp hơn nhóm 198G.
- Network đồng nhất: toàn bộ node nằm trong subnet 172.23.0.0/24 và dùng default gateway 172.23.0.126.
- Cảnh báo: net.ipv4.ip_forward đang bằng 0 trên tất cả node. Trạng thái này chưa sẵn sàng cho Kubernetes networking; cần bật trước khi triển khai thật.
- Swap 3.8Gi đang tồn tại trên toàn bộ node. Cần kiểm tra yêu cầu của phương án triển khai Kubernetes/RKE2/kubeadm trước khi cài.
- Kernel chưa đồng nhất hoàn toàn: có 5.15.0-171, 5.15.0-173 và 5.15.0-176. Không phải blocker tuyệt đối, nhưng nên chuẩn hóa nếu triển khai môi trường nghiêm túc.


## 4. Inventory đề xuất

```ini
[control_plane]
172.23.0.47 hostname=kubernetes-web02
172.23.0.48 hostname=Kubernetes-web03
172.23.0.24 hostname=monitoring-web02


[worker]
172.23.0.46 hostname=Kubernetes-web01
172.23.0.49 hostname=monitoring-web01
172.23.0.28 hostname=sonarqube-web
```