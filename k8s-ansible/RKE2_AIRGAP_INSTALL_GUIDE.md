# Hướng Dẫn Cài Đặt RKE2 Air-gap

Tài liệu này mô tả quy trình cài RKE2 air-gap cho cụm 3 control plane và 3 worker theo IP hiện tại của hệ thống.

Không cài từng node rời rạc trước khi chuẩn bị đủ artifact air-gap. Quy trình đúng là chuẩn bị artifact trên tất cả node, dựng control plane đầu tiên, join các control plane còn lại, rồi mới join worker.

## 1. Sơ Đồ Node

| Vai trò | Hostname Kubernetes | Inventory hiện tại | IP |
| --- | --- | --- | --- |
| Control plane 1 | `Kubernetes-cp01` | `Kubernetes-web02` | `172.23.0.47` |
| Control plane 2 | `Kubernetes-cp02` | `Kubernetes-web03` | `172.23.0.48` |
| Control plane 3 | `Kubernetes-cp03` | `monitoring-web02` | `172.23.0.24` |
| Worker 1 | `Kubernetes-worker01` | `Kubernetes-web01` | `172.23.0.46` |
| Worker 2 | `Kubernetes-worker02` | `monitoring-web01` | `172.23.0.49` |
| Worker 3 | `Kubernetes-worker03` | `sonarqube-web` | `172.23.0.28` |

Endpoint tạm thời để join cluster:

```text
https://172.23.0.47:9345
```

Lưu ý: đây là IP của `Kubernetes-cp01`. Với production nên dùng VIP hoặc Load Balancer trước 3 control plane, ví dụ:

```text
https://172.23.0.10:9345
```

Nếu chưa có VIP/LB thì dùng IP `cp01` để dựng trước được, nhưng đây là điểm yếu HA. Khi `cp01` chết, node mới sẽ không join được qua endpoint này và một số thao tác quản trị sẽ bất tiện.

## 2. Artifact Cần Có

Chuẩn bị các file air-gap:

```text
rke2.linux-amd64.tar.gz
rke2-images.linux-amd64.tar.zst
install.sh
sha256sum-amd64.txt
```

Trong repository hiện tại, các file local đang nằm ở:

```text
../rke2-images/
```

Khi copy lên node, đặt vào:

```text
/root/rke2-artifacts/
```

## 3. Chuẩn Bị Trên Tất Cả Node

Chạy trên cả 6 node:

```bash
sudo mkdir -p /root/rke2-artifacts
sudo mkdir -p /var/lib/rancher/rke2/agent/images
sudo mkdir -p /etc/rancher/rke2
```

Copy các artifact vào tất cả node:

```bash
sudo cp rke2.linux-amd64.tar.gz /root/rke2-artifacts/
sudo cp rke2-images.linux-amd64.tar.zst /root/rke2-artifacts/
sudo cp install.sh /root/rke2-artifacts/
sudo cp sha256sum-amd64.txt /root/rke2-artifacts/
sudo chmod +x /root/rke2-artifacts/install.sh
```

Đặt image bundle vào thư mục chuẩn của RKE2:

```bash
sudo cp /root/rke2-artifacts/rke2-images.linux-amd64.tar.zst /var/lib/rancher/rke2/agent/images/
```

## 4. Token Cluster

Tạo token mạnh và dùng chung cho toàn bộ server/agent:

```bash
openssl rand -hex 32
```

Ví dụ trong tài liệu:

```text
RKE2_CLUSTER_TOKEN_MANH
```

Khi triển khai thật, thay toàn bộ `RKE2_CLUSTER_TOKEN_MANH` bằng token thật.

## 5. Cài Control Plane 1

Thực hiện trên `Kubernetes-cp01`:

```text
IP: 172.23.0.47
Inventory: Kubernetes-web02
```

Cài binary RKE2 kiểu server:

```bash
cd /root/rke2-artifacts

sudo INSTALL_RKE2_ARTIFACT_PATH=/root/rke2-artifacts \
INSTALL_RKE2_TYPE=server \
sh install.sh
```

Tạo config:

```bash
sudo tee /etc/rancher/rke2/config.yaml >/dev/null <<'EOF'
token: "RKE2_CLUSTER_TOKEN_MANH"
node-name: "cp1"
node-ip: "172.23.0.47"
tls-san:
  - "172.23.0.47"
  - "172.23.0.48"
  - "172.23.0.24"
write-kubeconfig-mode: "0644"
disable:
  - rke2-ingress-nginx
EOF
```

Start service:

```bash
sudo systemctl enable rke2-server
sudo systemctl start rke2-server
```

Kiểm tra:

```bash
sudo systemctl status rke2-server --no-pager
export KUBECONFIG=/etc/rancher/rke2/rke2.yaml
/var/lib/rancher/rke2/bin/kubectl get nodes
```

## 6. Cài Control Plane 2 Và 3

Thực hiện trên:

```text
Kubernetes-cp02 - 172.23.0.48 - inventory Kubernetes-web03
Kubernetes-cp03 - 172.23.0.24 - inventory monitoring-web02
```

Trên mỗi node, cài binary RKE2 kiểu server:

```bash
cd /root/rke2-artifacts

sudo INSTALL_RKE2_ARTIFACT_PATH=/root/rke2-artifacts \
INSTALL_RKE2_TYPE=server \
sh install.sh
```

Tạo config trên `Kubernetes-cp02`:

```bash
sudo tee /etc/rancher/rke2/config.yaml >/dev/null <<'EOF'
server: "https://172.23.0.47:9345"
token: "RKE2_CLUSTER_TOKEN_MANH"
node-name: "cp2"
node-ip: "172.23.0.48"
tls-san:
  - "172.23.0.47"
  - "172.23.0.48"
  - "172.23.0.24"
write-kubeconfig-mode: "0644"
disable:
  - rke2-ingress-nginx
EOF
```

Tạo config trên `Kubernetes-cp03`:

```bash
sudo tee /etc/rancher/rke2/config.yaml >/dev/null <<'EOF'
server: "https://172.23.0.47:9345"
token: "RKE2_CLUSTER_TOKEN_MANH"
node-name: "cp3"
node-ip: "172.23.0.24"
tls-san:
  - "172.23.0.47"
  - "172.23.0.48"
  - "172.23.0.24"
write-kubeconfig-mode: "0644"
disable:
  - rke2-ingress-nginx
EOF
```

Start service trên từng node:

```bash
sudo systemctl enable rke2-server
sudo systemctl start rke2-server
```

Kiểm tra từ `Kubernetes-cp01`:

```bash
export KUBECONFIG=/etc/rancher/rke2/rke2.yaml
/var/lib/rancher/rke2/bin/kubectl get nodes -o wide
```

Kết quả mong đợi sau bước này:

```text
3 node control-plane
STATUS = Ready
```

## 7. Cài Worker 1, 2, 3

Thực hiện trên:

```text
Kubernetes-worker01 - 172.23.0.46 - inventory Kubernetes-web01
Kubernetes-worker02 - 172.23.0.49 - inventory monitoring-web01
Kubernetes-worker03 - 172.23.0.28 - inventory sonarqube-web
```

Trên mỗi worker, cài binary RKE2 kiểu agent:

```bash
cd /root/rke2-artifacts

sudo INSTALL_RKE2_ARTIFACT_PATH=/root/rke2-artifacts \
INSTALL_RKE2_TYPE=agent \
sh install.sh
```

Tạo config trên `Kubernetes-worker01`:

```bash
sudo tee /etc/rancher/rke2/config.yaml >/dev/null <<'EOF'
server: "https://172.23.0.47:9345"
token: "RKE2_CLUSTER_TOKEN_MANH"
node-name: "wk1"
node-ip: "172.23.0.46"
EOF
```

Tạo config trên `Kubernetes-worker02`:

```bash
sudo tee /etc/rancher/rke2/config.yaml >/dev/null <<'EOF'
server: "https://172.23.0.47:9345"
token: "RKE2_CLUSTER_TOKEN_MANH"
node-name: "wk2"
node-ip: "172.23.0.49"
EOF
```

Tạo config trên `Kubernetes-worker03`:

```bash
sudo tee /etc/rancher/rke2/config.yaml >/dev/null <<'EOF'
server: "https://172.23.0.47:9345"
token: "RKE2_CLUSTER_TOKEN_MANH"
node-name: "wk3"
node-ip: "172.23.0.28"
EOF
```

Start worker:

```bash
sudo systemctl enable rke2-agent
sudo systemctl start rke2-agent
```

## 8. Kiểm Tra Toàn Cụm

```bash
# 1. Thêm biến môi trường KUBECONFIG vào file .bashrc
echo 'export KUBECONFIG=/etc/rancher/rke2/rke2.yaml' >> ~/.bashrc

# 2. Tạo đường dẫn tắt (Alias) cho kubectl
echo 'alias kubectl="/var/lib/rancher/rke2/bin/kubectl"' >> ~/.bashrc

# 3. Nạp lại cấu hình ngay lập tức (chỉ cần làm lần này)
source ~/.bashrc
```

Chạy từ `Kubernetes-cp01`:

```bash
export KUBECONFIG=/etc/rancher/rke2/rke2.yaml
/var/lib/rancher/rke2/bin/kubectl get nodes -o wide
```



Kết quả đúng phải có:

```bash
NAME   STATUS   ROLES                AGE     VERSION          INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION      CONTAINER-RUNTIME
cp1    Ready    control-plane,etcd   6h35m   v1.34.6+rke2r3   172.23.0.47   <none>        Ubuntu 22.04.4 LTS   6.8.0-111-generic   containerd://2.2.2-k3s1
cp2    Ready    control-plane,etcd   6h30m   v1.34.6+rke2r3   172.23.0.48   <none>        Ubuntu 22.04.4 LTS   6.8.0-111-generic   containerd://2.2.2-k3s1
cp3    Ready    control-plane,etcd   6h27m   v1.34.6+rke2r3   172.23.0.24   <none>        Ubuntu 22.04.4 LTS   6.8.0-111-generic   containerd://2.2.2-k3s1
wk1    Ready    <none>               92s     v1.34.6+rke2r3   172.23.0.46   <none>        Ubuntu 22.04.4 LTS   6.8.0-111-generic   containerd://2.2.2-k3s1
wk2    Ready    <none>               76s     v1.34.6+rke2r3   172.23.0.49   <none>        Ubuntu 22.04.4 LTS   6.8.0-111-generic   containerd://2.2.2-k3s1
wk3    Ready    <none>               73s     v1.34.6+rke2r3   172.23.0.28   <none>        Ubuntu 22.04.4 LTS   6.8.0-111-generic   containerd://2.2.2-k3s1
```