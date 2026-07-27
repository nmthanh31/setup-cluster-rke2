# Hướng dẫn triển khai MongoDB Replica Set PSS trên 3 VM

> **Mục tiêu:** triển khai MongoDB Community Edition 8.0 trên Ubuntu Server 24.04 LTS theo mô hình **PSS — Primary, Secondary, Secondary**, có xác thực, kiểm tra replication, kiểm thử failover và checklist trước khi đưa vào production.
>
> **Phạm vi:** MongoDB self-managed trên VM, không sử dụng MongoDB Atlas, Kubernetes Operator, Docker hoặc Sharded Cluster.
>
> **Ngày biên soạn:** 2026-07-16.

---

## 1. Kiến trúc triển khai

```text
                         Application
                              |
      mongodb://mongo01,mongo02,mongo03/?replicaSet=rs0
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
      +-------------+  +-------------+  +-------------+
      | mongo01     |  | mongo02     |  | mongo03     |
      | PRIMARY (*) |  | SECONDARY   |  | SECONDARY   |
      | data-bearing|  | data-bearing|  | data-bearing|
      | vote = 1    |  | vote = 1    |  | vote = 1    |
      +-------------+  +-------------+  +-------------+

(*) Primary có thể thay đổi sau election.
```

Mỗi node:

- Chạy một tiến trình `mongod`.
- Có một phiếu bầu.
- Chứa đầy đủ dữ liệu và oplog.
- Có khả năng trở thành Primary.
- Phải nằm trên VM hoặc failure domain riêng.

Replica Set name dùng trong tài liệu:

```text
rs0
```

Port mặc định:

```text
27017/TCP
```

---

## 2. Giả định hạ tầng

Thay toàn bộ hostname và IP mẫu bằng thông tin thực tế.

| Node | Hostname/FQDN | IP mẫu | Vai trò ban đầu |
|---|---|---:|---|
| Node 1 | `mongo01.example.local` | `10.10.10.11` | Primary dự kiến |
| Node 2 | `mongo02.example.local` | `10.10.10.12` | Secondary |
| Node 3 | `mongo03.example.local` | `10.10.10.13` | Secondary |

Yêu cầu:

- Ubuntu Server 24.04 LTS 64-bit.
- Ba node dùng cùng major version MongoDB.
- Hostname ổn định và phân giải được hai chiều giữa ba node.
- Mỗi node có storage riêng.
- Đồng bộ thời gian bằng NTP/chrony/systemd-timesyncd.
- TCP `27017` thông giữa các thành viên Replica Set.
- Application chỉ truy cập từ subnet được cho phép.
- Không public port `27017` ra Internet.
- Không đặt HAProxy, Nginx hoặc VIP trước Replica Set; MongoDB driver phải nhìn thấy đầy đủ topology.
- Ba VM nên nằm trên ba hypervisor/failure domain khác nhau.

MongoDB khuyến nghị dùng hostname thay vì địa chỉ IP trong cấu hình thành viên Replica Set.

---

## 3. Mức tài nguyên tham khảo

Không có cấu hình CPU/RAM chung cho mọi workload. Phải sizing dựa trên working set, index, TPS, IOPS, latency, tăng trưởng dữ liệu và thời gian lưu oplog.

Mức khởi đầu tham khảo cho workload nhỏ đến trung bình:

| Thành phần | Mức khởi đầu |
|---|---:|
| vCPU | 4–8 |
| RAM | 16–32 GiB |
| Data disk | Theo dataset + index + oplog + tăng trưởng + tối thiểu 20–30% free |
| Filesystem | XFS |
| Storage | SSD/NVMe hoặc SAN có latency ổn định |
| Network | Tối thiểu 1 Gbps; production nên có dự phòng |

Lưu ý:

- Ba node đều lưu toàn bộ dataset.
- Dataset 1 TiB không có nghĩa tổng storage chỉ cần 1 TiB; cần khoảng 1 TiB trên mỗi node, chưa tính index, oplog và khoảng trống.
- Không dùng NFS cho `dbPath`.
- Với WiredTiger, MongoDB khuyến nghị mạnh XFS cho data-bearing node.

---

## 4. Chuẩn bị DNS và hostname

### 4.1 Đặt hostname

Thực hiện đúng hostname trên từng node.

Node 1:

```bash
sudo hostnamectl set-hostname mongo01.example.local
```

Node 2:

```bash
sudo hostnamectl set-hostname mongo02.example.local
```

Node 3:

```bash
sudo hostnamectl set-hostname mongo03.example.local
```

Đăng nhập lại hoặc chạy:

```bash
exec bash
```

### 4.2 Kiểm tra DNS

Thực hiện trên cả ba node:

```bash
getent hosts mongo01.example.local
getent hosts mongo02.example.local
getent hosts mongo03.example.local
```

Kết quả phải trả đúng IP của từng node.

Nếu DNS nội bộ chưa sẵn sàng, có thể dùng `/etc/hosts` tạm thời:

```bash
sudo tee -a /etc/hosts >/dev/null <<'EOF'
10.10.10.11 mongo01.example.local mongo01
10.10.10.12 mongo02.example.local mongo02
10.10.10.13 mongo03.example.local mongo03
EOF
```

Không nên phụ thuộc lâu dài vào `/etc/hosts` nếu hệ thống production đã có DNS nội bộ.

### 4.3 Kiểm tra kết nối giữa các node

Trước khi cài MongoDB:

```bash
ping -c 3 mongo01.example.local
ping -c 3 mongo02.example.local
ping -c 3 mongo03.example.local
```

Sau khi MongoDB được khởi động, kiểm tra port:

```bash
nc -vz mongo01.example.local 27017
nc -vz mongo02.example.local 27017
nc -vz mongo03.example.local 27017
```

---

## 5. Đồng bộ thời gian

Thực hiện trên cả ba node:

```bash
timedatectl
timedatectl timesync-status 2>/dev/null || true
```

Nếu dùng `systemd-timesyncd`:

```bash
sudo systemctl enable --now systemd-timesyncd
systemctl status systemd-timesyncd --no-pager
```

Nếu hạ tầng dùng chrony thì kiểm tra:

```bash
chronyc tracking
chronyc sources -v
```

Không vận hành Replica Set production khi đồng hồ giữa các node lệch đáng kể.

---

## 6. Chuẩn bị data disk XFS

Phần này chỉ thực hiện nếu có data disk riêng. Ví dụ giả định disk mới là `/dev/vdb`.

> **CẢNH BÁO:** `mkfs.xfs` xóa toàn bộ dữ liệu trên thiết bị được chọn. Phải xác minh đúng disk trống trước khi chạy.

### 6.1 Xác minh thiết bị

```bash
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS,UUID
sudo blkid
```

Ví dụ tạo partition GPT trên disk trống:

```bash
sudo parted -s /dev/vdb mklabel gpt
sudo parted -s /dev/vdb mkpart primary xfs 0% 100%
```

Format XFS:

```bash
sudo mkfs.xfs -f /dev/vdb1
```

Tạo mount point:

```bash
sudo mkdir -p /data
```

Lấy UUID:

```bash
sudo blkid /dev/vdb1
```

Thêm vào `/etc/fstab`, thay `<UUID>` bằng giá trị thực:

```bash
echo 'UUID=<UUID> /data xfs defaults,noatime 0 2' | sudo tee -a /etc/fstab
```

Mount và kiểm tra:

```bash
sudo mount -a
df -hT /data
findmnt /data
```

Tạo thư mục MongoDB:

```bash
sudo mkdir -p /data/mongodb
```

User `mongodb` sẽ được tạo sau khi cài package. Quyền sở hữu sẽ được gán ở bước cấu hình.

---

## 7. Cài MongoDB Community Edition 8.0

MongoDB 8.0 là major release có vòng đời hỗ trợ dự đoán được. Repository `8.0` sẽ cung cấp patch release mới nhất trong nhánh 8.0.

Thực hiện các bước dưới đây trên **cả ba node**.

### 7.1 Kiểm tra hệ điều hành và kiến trúc

```bash
cat /etc/os-release
uname -m
```

Kỳ vọng:

```text
Ubuntu 24.04 LTS
x86_64 hoặc ARM64 được MongoDB hỗ trợ
```

### 7.2 Loại bỏ package xung đột nếu từng cài từ Ubuntu repository

Kiểm tra:

```bash
dpkg -l | grep -E '^ii\s+(mongodb|mongodb-server|mongodb-clients)\b' || true
```

Không được nhầm package Ubuntu `mongodb` với package chính thức `mongodb-org`.

Chỉ khi đã xác nhận có package xung đột và không có dữ liệu cần giữ:

```bash
sudo apt-get remove --purge -y mongodb mongodb-server mongodb-clients
```

### 7.3 Cài dependency

```bash
sudo apt-get update
sudo apt-get install -y gnupg curl ca-certificates openssl netcat-openbsd xfsprogs
```

### 7.4 Import MongoDB GPG key

```bash
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg \
  --dearmor
```

Kiểm tra file:

```bash
ls -l /usr/share/keyrings/mongodb-server-8.0.gpg
```

### 7.5 Khai báo MongoDB repository cho Ubuntu 24.04 Noble

```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
```

Cập nhật package index:

```bash
sudo apt-get update
```

Kiểm tra candidate version:

```bash
apt-cache policy mongodb-org
```

### 7.6 Cài package chính thức

```bash
sudo apt-get install -y mongodb-org
```

Kiểm tra:

```bash
mongod --version
mongosh --version
dpkg -l | grep mongodb
```

Ba node phải dùng cùng major version, tốt nhất cùng patch version.

### 7.7 Chưa khởi động dịch vụ ngay

```bash
sudo systemctl stop mongod 2>/dev/null || true
sudo systemctl disable mongod 2>/dev/null || true
```

---

## 8. Chuẩn bị thư mục dữ liệu và log

Thực hiện trên cả ba node:

```bash
sudo mkdir -p /data/mongodb
sudo mkdir -p /var/log/mongodb
sudo chown -R mongodb:mongodb /data/mongodb
sudo chown -R mongodb:mongodb /var/log/mongodb
sudo chmod 750 /data/mongodb
sudo chmod 755 /var/log/mongodb
```

Kiểm tra:

```bash
namei -l /data/mongodb
ls -ld /data/mongodb /var/log/mongodb
```

---

## 9. Chọn cơ chế xác thực nội bộ

Có hai phương án:

### Phương án A — Keyfile

- Dễ triển khai.
- Mọi thành viên dùng cùng một shared secret.
- Tự động bật internal authentication và access control.
- Phù hợp để dựng cluster, lab, UAT hoặc production tạm thời có kiểm soát.
- Tài liệu MongoDB hiện hành khuyến nghị X.509 thay vì keyfile cho production do khả năng quản lý khóa và độ mạnh mật mã tốt hơn.

Tài liệu này cung cấp đầy đủ quy trình bằng keyfile vì đây là phương án Community Edition dễ triển khai nhất.

### Phương án B — TLS + X.509

- Được MongoDB khuyến nghị cho internal member authentication production.
- Cần CA/PKI và certificate riêng cho mỗi node.
- Certificate phải có SAN khớp hostname.
- Nếu một certificate được dùng cho cả server và cluster member, EKU phải có `serverAuth` và `clientAuth`.
- Nên được áp dụng trước go-live.

Xem mục **22. Nâng cấp bảo mật production bằng TLS/X.509**.

---

## 10. Tạo keyfile dùng chung

Chỉ tạo keyfile **một lần trên Node 1**, sau đó sao chép nguyên vẹn sang Node 2 và Node 3.

### 10.1 Tạo keyfile trên Node 1

Trên `mongo01`:

```bash
openssl rand -base64 756 | sudo tee /etc/mongodb-keyfile >/dev/null
sudo chown mongodb:mongodb /etc/mongodb-keyfile
sudo chmod 400 /etc/mongodb-keyfile
sudo ls -l /etc/mongodb-keyfile
```

Kỳ vọng quyền:

```text
-r-------- 1 mongodb mongodb ...
```

Không in nội dung keyfile ra terminal, ticket hoặc chat.

### 10.2 Sao chép an toàn sang Node 2 và Node 3

Ví dụ dùng tài khoản quản trị có SSH:

```bash
sudo cp /etc/mongodb-keyfile /tmp/mongodb-keyfile
sudo chown "$(id -u):$(id -g)" /tmp/mongodb-keyfile
chmod 600 /tmp/mongodb-keyfile

scp /tmp/mongodb-keyfile admin@mongo02.example.local:/tmp/mongodb-keyfile
scp /tmp/mongodb-keyfile admin@mongo03.example.local:/tmp/mongodb-keyfile

rm -f /tmp/mongodb-keyfile
```

Trên `mongo02` và `mongo03`:

```bash
sudo install -o mongodb -g mongodb -m 400 \
  /tmp/mongodb-keyfile /etc/mongodb-keyfile

rm -f /tmp/mongodb-keyfile

sudo ls -l /etc/mongodb-keyfile
```

### 10.3 Xác minh ba keyfile giống nhau

Thực hiện trên từng node:

```bash
sudo sha256sum /etc/mongodb-keyfile
```

Hash phải giống hoàn toàn trên cả ba node.

Không lưu keyfile trên NFS, USB hoặc storage có thể bị tháo rời.

---

## 11. Cấu hình `mongod.conf`

Backup file mặc định trên từng node:

```bash
sudo cp -a /etc/mongod.conf /etc/mongod.conf.bak.$(date +%F-%H%M%S)
```

### 11.1 Node 1 — `mongo01`

```bash
sudo tee /etc/mongod.conf >/dev/null <<'EOF'
storage:
  dbPath: /data/mongodb

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1,mongo01.example.local

processManagement:
  timeZoneInfo: /usr/share/zoneinfo

security:
  authorization: enabled
  keyFile: /etc/mongodb-keyfile

replication:
  replSetName: rs0
EOF
```

### 11.2 Node 2 — `mongo02`

```bash
sudo tee /etc/mongod.conf >/dev/null <<'EOF'
storage:
  dbPath: /data/mongodb

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1,mongo02.example.local

processManagement:
  timeZoneInfo: /usr/share/zoneinfo

security:
  authorization: enabled
  keyFile: /etc/mongodb-keyfile

replication:
  replSetName: rs0
EOF
```

### 11.3 Node 3 — `mongo03`

```bash
sudo tee /etc/mongod.conf >/dev/null <<'EOF'
storage:
  dbPath: /data/mongodb

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1,mongo03.example.local

processManagement:
  timeZoneInfo: /usr/share/zoneinfo

security:
  authorization: enabled
  keyFile: /etc/mongodb-keyfile

replication:
  replSetName: rs0
EOF
```

### 11.4 Kiểm tra quyền file cấu hình

```bash
sudo chown root:root /etc/mongod.conf
sudo chmod 644 /etc/mongod.conf
```

Kiểm tra nội dung:

```bash
sudo cat /etc/mongod.conf
```

YAML không được dùng tab. Sai thụt dòng làm `mongod` không khởi động.

---

## 12. Firewall

Chỉ cho phép:

1. Ba MongoDB node giao tiếp với nhau trên TCP `27017`.
2. Application subnet truy cập TCP `27017`.
3. Monitoring/backup host truy cập khi thực sự cần.
4. Không mở `27017` cho `0.0.0.0/0`.

Ví dụ UFW trên từng node:

```bash
sudo ufw allow from 10.10.10.11 to any port 27017 proto tcp
sudo ufw allow from 10.10.10.12 to any port 27017 proto tcp
sudo ufw allow from 10.10.10.13 to any port 27017 proto tcp

# Thay subnet ứng dụng bằng subnet thực tế:
sudo ufw allow from 10.20.0.0/16 to any port 27017 proto tcp
```

Chỉ enable UFW nếu hạ tầng thực tế đang quản lý firewall bằng UFW và rule SSH đã tồn tại:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status verbose
```

Nếu dùng firewall tập trung, security group, ACL hoặc iptables/nftables thì triển khai rule tương đương.

---

## 13. Kiểm tra resource limit

MongoDB cảnh báo nếu giới hạn open files thấp hơn `64000`.

Khởi động dịch vụ tạm thời sau bước 14 rồi kiểm tra trực tiếp process:

```bash
PID=$(pgrep -x mongod)
cat /proc/"$PID"/limits | grep -i 'Max open files'
```

Nếu thấp hơn `64000`, tạo systemd override:

```bash
sudo systemctl edit mongod
```

Nội dung:

```ini
[Service]
LimitNOFILE=64000
```

Sau đó:

```bash
sudo systemctl daemon-reload
sudo systemctl restart mongod
```

Kiểm tra lại:

```bash
PID=$(pgrep -x mongod)
cat /proc/"$PID"/limits | grep -i 'Max open files'
```

Không chỉnh `ulimit` tùy tiện nếu package/systemd đã cung cấp mức phù hợp.

---

## 14. Khởi động MongoDB trên cả ba node

Thực hiện trên từng node:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mongod
sudo systemctl status mongod --no-pager -l
```

Kiểm tra port:

```bash
sudo ss -lntp | grep 27017
```

Kiểm tra log:

```bash
sudo tail -n 100 /var/log/mongodb/mongod.log
```

Kiểm tra lỗi systemd:

```bash
sudo journalctl -u mongod -n 200 --no-pager
```

Nếu dịch vụ không chạy, không tiếp tục `rs.initiate()` cho tới khi cả ba node đều hoạt động.

---

## 15. Kiểm tra kết nối ba chiều

Từ Node 1:

```bash
nc -vz mongo02.example.local 27017
nc -vz mongo03.example.local 27017
```

Từ Node 2:

```bash
nc -vz mongo01.example.local 27017
nc -vz mongo03.example.local 27017
```

Từ Node 3:

```bash
nc -vz mongo01.example.local 27017
nc -vz mongo02.example.local 27017
```

Mỗi lệnh phải báo kết nối thành công.

---

## 16. Khởi tạo Replica Set

Chỉ thực hiện **một lần trên Node 1**.

### 16.1 Kết nối qua localhost exception

Trên `mongo01`:

```bash
mongosh --host 127.0.0.1 --port 27017
```

Localhost exception chỉ tồn tại khi deployment chưa có user. Sau khi tạo user đầu tiên, ngoại lệ này đóng lại.

### 16.2 Chạy `rs.initiate()`

Trong `mongosh`:

```javascript
rs.initiate(
  {
    _id: "rs0",
    members: [
      {
        _id: 0,
        host: "mongo01.example.local:27017",
        priority: 2
      },
      {
        _id: 1,
        host: "mongo02.example.local:27017",
        priority: 1
      },
      {
        _id: 2,
        host: "mongo03.example.local:27017",
        priority: 1
      }
    ]
  }
)
```

Giải thích:

- `_id: "rs0"` phải trùng `replication.replSetName`.
- `priority: 2` làm `mongo01` được ưu tiên hơn khi đủ điều kiện, nhưng không bảo đảm nó luôn là Primary.
- Hai Secondary vẫn có thể được bầu Primary.
- Không cấu hình `arbiterOnly`.
- Không cấu hình `votes: 0`.
- Đây là PSS với ba data-bearing voting member.

Kiểm tra trạng thái:

```javascript
rs.status()
```

Đợi tới khi thấy:

- Một member có `stateStr: "PRIMARY"`.
- Hai member có `stateStr: "SECONDARY"`.

Xem gọn:

```javascript
rs.status().members.map(m => ({
  name: m.name,
  state: m.stateStr,
  health: m.health,
  uptime: m.uptime,
  lastHeartbeatMessage: m.lastHeartbeatMessage
}))
```

Xem cấu hình:

```javascript
rs.conf()
```

---

## 17. Tạo tài khoản quản trị đầu tiên

Phải thực hiện khi đang kết nối tới Primary.

Kiểm tra:

```javascript
db.hello().isWritablePrimary
```

Kết quả phải là:

```text
true
```

Chuyển sang database `admin`:

```javascript
use admin
```

Tạo tài khoản bootstrap admin:

```javascript
db.createUser({
  user: "mongoAdmin",
  pwd: passwordPrompt(),
  roles: [
    { role: "root", db: "admin" }
  ]
})
```

`root` là quyền rất cao. Tài khoản này chỉ dùng cho quản trị, không dùng trong application.

Thoát:

```javascript
exit
```

Kiểm tra đăng nhập:

```bash
mongosh "mongodb://mongoAdmin@mongo01.example.local:27017/admin?replicaSet=rs0" \
  --password
```

Không ghi password trực tiếp vào shell history.

---

## 18. Tạo application database và user

Ví dụ application database là `appdb`.

Đăng nhập bằng admin:

```bash
mongosh "mongodb://mongoAdmin@mongo01.example.local:27017/admin?replicaSet=rs0" \
  --password
```

Trong `mongosh`:

```javascript
use appdb
```

Tạo user chỉ có quyền đọc/ghi trên `appdb`:

```javascript
db.createUser({
  user: "app_user",
  pwd: passwordPrompt(),
  roles: [
    { role: "readWrite", db: "appdb" }
  ]
})
```

Kiểm tra:

```javascript
db.getUser("app_user")
```

Không cấp `root`, `dbAdminAnyDatabase` hoặc `readWriteAnyDatabase` cho application nếu không có yêu cầu thực tế.

---

## 19. Connection string cho ứng dụng

Application phải khai báo cả ba node:

```text
mongodb://app_user:<PASSWORD>@mongo01.example.local:27017,mongo02.example.local:27017,mongo03.example.local:27017/appdb?replicaSet=rs0&authSource=appdb&retryWrites=true&w=majority
```

Nếu password có ký tự đặc biệt, phải URL-encode.

Ví dụ kết nối bằng `mongosh`:

```bash
mongosh "mongodb://app_user@mongo01.example.local:27017,mongo02.example.local:27017,mongo03.example.local:27017/appdb?replicaSet=rs0&authSource=appdb&retryWrites=true&w=majority" \
  --password
```

Không cấu hình ứng dụng chỉ kết nối một host:

```text
mongodb://mongo01.example.local:27017
```

Kết nối một host làm application phụ thuộc vào node đó và không tận dụng đầy đủ automatic failover của driver.

---

## 20. Kiểm thử replication

Đăng nhập bằng application user:

```bash
mongosh "mongodb://app_user@mongo01.example.local:27017,mongo02.example.local:27017,mongo03.example.local:27017/appdb?replicaSet=rs0&authSource=appdb&w=majority" \
  --password
```

Tạo dữ liệu test:

```javascript
db.replica_test.insertOne({
  message: "PSS replication test",
  createdAt: new Date()
})
```

Đọc lại:

```javascript
db.replica_test.find().sort({ _id: -1 }).limit(5)
```

Đăng nhập admin và kiểm tra trạng thái replication:

```bash
mongosh "mongodb://mongoAdmin@mongo01.example.local:27017,mongo02.example.local:27017,mongo03.example.local:27017/admin?replicaSet=rs0" \
  --password
```

Trong `mongosh`:

```javascript
rs.status().members.map(m => ({
  member: m.name,
  state: m.stateStr,
  optimeDate: m.optimeDate,
  lastAppliedWallTime: m.lastAppliedWallTime,
  pingMs: m.pingMs
}))
```

Kiểm tra replication lag:

```javascript
const s = rs.status()
const primary = s.members.find(m => m.stateStr === "PRIMARY")
s.members
  .filter(m => m.stateStr === "SECONDARY")
  .map(m => ({
    secondary: m.name,
    lagSeconds: (primary.optimeDate - m.optimeDate) / 1000
  }))
```

Lag phải được đánh giá theo workload và yêu cầu RPO/RTO; không có một ngưỡng chung cho mọi hệ thống.

---

## 21. Kiểm thử automatic failover

Chỉ thực hiện trong cửa sổ kiểm thử có kiểm soát, không làm giữa giờ production.

### 21.1 Xác định Primary hiện tại

```javascript
db.hello()
```

Hoặc:

```javascript
rs.status().members.map(m => ({
  name: m.name,
  state: m.stateStr
}))
```

### 21.2 Yêu cầu Primary step down

Kết nối trực tiếp vào Primary bằng admin rồi chạy:

```javascript
rs.stepDown(60)
```

Session có thể bị ngắt. Đây là hành vi bình thường.

### 21.3 Kết nối lại qua seed list

```bash
mongosh "mongodb://mongoAdmin@mongo01.example.local:27017,mongo02.example.local:27017,mongo03.example.local:27017/admin?replicaSet=rs0" \
  --password
```

Kiểm tra Primary mới:

```javascript
db.hello().primary
```

Kiểm tra trạng thái:

```javascript
rs.status().members.map(m => ({
  name: m.name,
  state: m.stateStr,
  health: m.health
}))
```

Kỳ vọng:

- Một Secondary được bầu làm Primary.
- Node cũ trở lại dưới vai trò Secondary sau thời gian step-down.
- Application dùng đúng MongoDB driver và seed list sẽ tự chuyển sang Primary mới.

### 21.4 Kiểm thử dừng service

Chỉ test sau khi `rs.stepDown()` thành công.

Trên Primary hiện tại:

```bash
sudo systemctl stop mongod
```

Từ node khác, kiểm tra election:

```bash
mongosh "mongodb://mongoAdmin@mongo01.example.local:27017,mongo02.example.local:27017,mongo03.example.local:27017/admin?replicaSet=rs0&serverSelectionTimeoutMS=15000" \
  --password
```

Sau khi xác nhận cluster vẫn hoạt động, khởi động lại node:

```bash
sudo systemctl start mongod
sudo systemctl status mongod --no-pager
```

Không dừng hai data-bearing member cùng lúc. PSS ba member chỉ chịu được một member lỗi tại một thời điểm mà vẫn giữ majority.

---

## 22. Nâng cấp bảo mật production bằng TLS/X.509

### 22.1 Yêu cầu chứng thư

Mỗi node cần certificate riêng:

```text
/etc/mongodb/pki/ca.crt
/etc/mongodb/pki/mongo01.pem
/etc/mongodb/pki/mongo02.pem
/etc/mongodb/pki/mongo03.pem
```

File `.pem` dùng bởi `mongod` thường chứa:

```text
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

Yêu cầu quan trọng:

- Tất cả certificate member được cấp bởi cùng CA tin cậy.
- SAN phải chứa FQDN mà các member dùng để kết nối.
- Không chỉ dựa vào CN; dùng SAN.
- Nếu dùng cùng certificate cho client/server nội bộ, EKU cần:
  - `serverAuth`
  - `clientAuth`
- Các thuộc tính dùng xác thực thành viên như `O`, `OU`, `DC` phải tương thích theo yêu cầu MongoDB.
- Private key không được có passphrase nếu `mongod` cần tự khởi động bằng systemd, trừ khi có cơ chế quản lý phù hợp.
- Quyền file private key phải giới hạn cho user `mongodb`.

Ví dụ quyền:

```bash
sudo chown -R mongodb:mongodb /etc/mongodb/pki
sudo find /etc/mongodb/pki -type d -exec chmod 750 {} \;
sudo chmod 640 /etc/mongodb/pki/ca.crt
sudo chmod 600 /etc/mongodb/pki/*.pem
```

### 22.2 Cấu hình greenfield TLS/X.509

Nếu triển khai mới và certificate đã sẵn sàng, có thể dùng X.509 ngay từ đầu thay cho keyfile.

Ví dụ Node 1:

```yaml
storage:
  dbPath: /data/mongodb

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1,mongo01.example.local
  tls:
    mode: requireTLS
    certificateKeyFile: /etc/mongodb/pki/mongo01.pem
    CAFile: /etc/mongodb/pki/ca.crt

processManagement:
  timeZoneInfo: /usr/share/zoneinfo

security:
  authorization: enabled
  clusterAuthMode: x509

replication:
  replSetName: rs0
```

Node 2 và Node 3 thay `bindIp` và `certificateKeyFile` theo hostname tương ứng.

Kết nối `mongosh` có TLS:

```bash
mongosh "mongodb://mongoAdmin@mongo01.example.local:27017,mongo02.example.local:27017,mongo03.example.local:27017/admin?replicaSet=rs0&tls=true" \
  --tlsCAFile /etc/ssl/certs/mongodb-ca.crt \
  --password
```

Connection string ứng dụng:

```text
mongodb://app_user:<PASSWORD>@mongo01.example.local:27017,mongo02.example.local:27017,mongo03.example.local:27017/appdb?replicaSet=rs0&authSource=appdb&retryWrites=true&w=majority&tls=true
```

Application phải trust CA đã cấp certificate cho MongoDB.

### 22.3 Cluster đang chạy keyfile không được chuyển thẳng sang `x509`

Không thay trực tiếp:

```yaml
security:
  clusterAuthMode: x509
```

trên cả ba node cùng lúc.

Phải thực hiện rolling transition theo tài liệu chính thức:

```text
keyFile
→ sendKeyFile
→ sendX509
→ x509
```

Quy trình phải thực hiện từng member một, Secondary trước và Primary cuối cùng. Sao lưu cấu hình và có kế hoạch rollback trước khi chuyển đổi.

---

## 23. Transparent Huge Pages trên MongoDB 8.0

Không áp dụng máy móc hướng dẫn cũ “luôn disable THP”.

Từ MongoDB 8.0, MongoDB dùng TCMalloc mới và tài liệu chính thức hướng dẫn xem xét **enable THP** cho MongoDB 8.0 trở lên. Khuyến nghị disable THP chủ yếu áp dụng MongoDB 7.0 trở xuống.

Kiểm tra trạng thái:

```bash
cat /sys/kernel/mm/transparent_hugepage/enabled
cat /sys/kernel/mm/transparent_hugepage/defrag
```

Không thay đổi THP trước khi:

- Xác nhận đúng version MongoDB.
- Đọc tài liệu TCMalloc/THP tương ứng.
- Benchmark workload.
- Kiểm tra ảnh hưởng tới các workload khác trên VM.

---

## 24. Pin package sau khi xác nhận version

Để tránh patch tự động được cài ngoài quy trình rolling upgrade:

```bash
sudo apt-mark hold \
  mongodb-org \
  mongodb-org-database \
  mongodb-org-server \
  mongodb-mongosh \
  mongodb-org-mongos \
  mongodb-org-tools \
  mongodb-org-database-tools-extra
```

Kiểm tra:

```bash
apt-mark showhold | grep mongodb
```

Không có nghĩa là không nâng cấp. Phải theo dõi security bulletin và thực hiện rolling upgrade có kế hoạch.

Bỏ hold khi nâng cấp:

```bash
sudo apt-mark unhold \
  mongodb-org \
  mongodb-org-database \
  mongodb-org-server \
  mongodb-mongosh \
  mongodb-org-mongos \
  mongodb-org-tools \
  mongodb-org-database-tools-extra
```

Thứ tự rolling patch upgrade thông thường:

1. Secondary 1.
2. Secondary 2.
3. Step down Primary.
4. Nâng cấp Primary cũ.
5. Xác minh replication và application sau mỗi node.

Không nâng hai node đồng thời.

---

## 25. Backup và restore

Replica Set không phải backup.

Lỗi logic như:

- Xóa nhầm collection.
- Update sai toàn bộ document.
- Application ghi dữ liệu lỗi.
- Ransomware hoặc credential bị lộ.

sẽ được replicate sang các Secondary.

Production cần:

- Backup lưu ngoài ba MongoDB VM.
- Chính sách retention.
- Mã hóa backup.
- Kiểm tra restore định kỳ.
- Tài liệu RPO/RTO.
- Theo dõi trạng thái job backup.
- Không chỉ dựa vào VM snapshot không nhất quán.

Tùy quy mô:

- `mongodump`/`mongorestore` cho backup logic hoặc dataset nhỏ.
- Storage snapshot có quy trình đảm bảo consistency.
- MongoDB Ops Manager/Cloud Manager nếu phù hợp license và kiến trúc.
- Point-in-time recovery khi nghiệp vụ yêu cầu.

Không tuyên bố backup thành công nếu chưa restore thử.

---

## 26. Monitoring tối thiểu

Phải giám sát:

### Replica Set

- Primary/Secondary state.
- Election count.
- Replica lag.
- Oplog window.
- Member health.
- Heartbeat error.
- Rollback event.

### Hệ điều hành

- CPU.
- RAM và swap.
- Disk usage.
- Disk latency/IOPS/queue.
- Network latency, retransmission và packet loss.
- Open file descriptors.
- Clock synchronization.

### MongoDB

- WiredTiger cache.
- Connections.
- Operation latency.
- Queue/tickets.
- Slow query.
- Index usage.
- Lock/contention.
- Page fault.
- Checkpoint.
- Backup status.

Các lựa chọn thường dùng:

- MongoDB Ops Manager.
- MongoDB Cloud Manager.
- Prometheus exporter + Prometheus + Grafana.
- Agent/APM tương thích.

Không chỉ monitor `mongod` process hoặc port `27017`.

---

## 27. Lệnh vận hành thường dùng

### Trạng thái service

```bash
sudo systemctl status mongod --no-pager -l
sudo journalctl -u mongod -n 200 --no-pager
sudo tail -f /var/log/mongodb/mongod.log
```

### Trạng thái Replica Set

```javascript
rs.status()
rs.conf()
db.hello()
```

### Liệt kê member gọn

```javascript
rs.status().members.map(m => ({
  name: m.name,
  state: m.stateStr,
  health: m.health,
  optimeDate: m.optimeDate,
  pingMs: m.pingMs,
  lastHeartbeatMessage: m.lastHeartbeatMessage
}))
```

### Xác định Primary

```javascript
db.hello().primary
```

### Step down Primary có kiểm soát

```javascript
rs.stepDown(60)
```

### Kiểm tra server version

```javascript
db.version()
db.adminCommand({ getParameter: 1, featureCompatibilityVersion: 1 })
```

### Kiểm tra connections

```javascript
db.serverStatus().connections
```

### Kiểm tra oplog

```javascript
use local
db.oplog.rs.stats()
```

### Xem oplog window

```javascript
rs.printReplicationInfo()
```

### Xem replication delay phía Secondary

```javascript
rs.printSecondaryReplicationInfo()
```

---

## 28. Troubleshooting

### 28.1 `mongod` không khởi động

```bash
sudo systemctl status mongod --no-pager -l
sudo journalctl -xeu mongod --no-pager
sudo tail -n 200 /var/log/mongodb/mongod.log
```

Kiểm tra:

```bash
sudo ls -l /etc/mongodb-keyfile
sudo ls -ld /data/mongodb /var/log/mongodb
sudo cat /etc/mongod.conf
getent hosts "$(hostname -f)"
```

Nguyên nhân thường gặp:

- YAML sai thụt dòng.
- Keyfile không thuộc `mongodb:mongodb`.
- Keyfile có quyền group/world.
- `dbPath` không tồn tại hoặc sai owner.
- Hostname trong `bindIp` không resolve về IP local.
- Port đã bị tiến trình khác sử dụng.
- AppArmor/SELinux hoặc permission chặn đường dẫn custom.
- Disk full hoặc filesystem read-only.

### 28.2 Keyfile permission error

Yêu cầu:

```bash
sudo chown mongodb:mongodb /etc/mongodb-keyfile
sudo chmod 400 /etc/mongodb-keyfile
```

Xác minh:

```bash
sudo -u mongodb test -r /etc/mongodb-keyfile && echo OK
```

### 28.3 Node không join Replica Set

Kiểm tra DNS:

```bash
getent hosts mongo01.example.local
getent hosts mongo02.example.local
getent hosts mongo03.example.local
```

Kiểm tra port:

```bash
nc -vz <peer-hostname> 27017
```

Kiểm tra keyfile hash:

```bash
sudo sha256sum /etc/mongodb-keyfile
```

Kiểm tra `replSetName`:

```bash
grep -A3 '^replication:' /etc/mongod.conf
```

Ba node phải cùng `rs0`.

### 28.4 Không có Primary

Kiểm tra:

```javascript
rs.status()
rs.conf()
```

PSS cần ít nhất hai trong ba voting members liên lạc được để có majority.

Kiểm tra:

- Hai node trở lên có đang down không.
- Network partition.
- DNS sai.
- Firewall chặn `27017`.
- Keyfile khác nhau.
- Disk full.
- Clock lệch.
- Node có trạng thái `RECOVERING`, `ROLLBACK` hoặc `STARTUP2`.

### 28.5 Authentication failed

Xác nhận đúng authentication database:

- `mongoAdmin` được tạo trong `admin` → `authSource=admin`.
- `app_user` được tạo trong `appdb` → `authSource=appdb`.

Không nhầm password có ký tự đặc biệt chưa URL-encode.

### 28.6 Application không tự failover

Kiểm tra application:

- Dùng MongoDB driver chính thức hoặc driver tương thích.
- Connection string có cả ba node.
- Có `replicaSet=rs0`.
- Không đặt proxy/VIP làm driver chỉ nhìn thấy một endpoint.
- `serverSelectionTimeoutMS` không đặt quá thấp.
- DNS từ application resolve được hostname member trả về bởi Replica Set.
- TLS SAN khớp hostname nếu bật TLS.

---

## 29. Checklist nghiệm thu trước production

### Kiến trúc

- [ ] Có đúng ba data-bearing member.
- [ ] Một Primary và hai Secondary.
- [ ] Không có Arbiter.
- [ ] Ba VM nằm trên failure domain khác nhau.
- [ ] Ba node cùng major và patch version.
- [ ] Hostname/FQDN ổn định.

### Storage

- [ ] `dbPath` trên storage riêng.
- [ ] Filesystem XFS.
- [ ] Không dùng NFS.
- [ ] Còn tối thiểu 20–30% dung lượng hoặc theo capacity plan.
- [ ] Disk latency đã benchmark với workload gần thực tế.
- [ ] Có cảnh báo disk usage và latency.

### Network

- [ ] `27017/TCP` thông giữa ba node.
- [ ] Chỉ application subnet được truy cập.
- [ ] Không expose Internet.
- [ ] Không có NAT/proxy làm sai hostname member.
- [ ] DNS resolve đúng từ cả node và application.
- [ ] Network latency/loss nằm trong ngưỡng thiết kế.

### Security

- [ ] Access control đã bật.
- [ ] Application dùng user least privilege.
- [ ] Admin account không dùng trong application.
- [ ] Password lưu trong secret manager.
- [ ] Keyfile không bị lộ và permission đúng.
- [ ] TLS đã bật trước go-live.
- [ ] Production ưu tiên X.509 internal authentication.
- [ ] Certificate SAN khớp FQDN.
- [ ] Firewall và audit được kiểm tra.

### Availability

- [ ] `rs.status()` có 1 Primary + 2 Secondary.
- [ ] Replication lag trong ngưỡng.
- [ ] `w=majority` đã được kiểm thử.
- [ ] `rs.stepDown()` thành công.
- [ ] Dừng một member không làm mất service.
- [ ] Application tự reconnect sau election.
- [ ] Không dừng hai member cùng lúc.

### Backup/DR

- [ ] Có backup ngoài cluster.
- [ ] Có retention.
- [ ] Có mã hóa backup.
- [ ] Restore test đã thành công.
- [ ] RPO/RTO được phê duyệt.
- [ ] Có runbook mất Primary, mất Secondary và mất site.

### Monitoring

- [ ] Alert member down.
- [ ] Alert no Primary.
- [ ] Alert replication lag.
- [ ] Alert oplog window thấp.
- [ ] Alert disk full/latency cao.
- [ ] Alert backup failed.
- [ ] Log MongoDB được thu thập tập trung.

---

## 30. Tài liệu chính thức MongoDB tham khảo

1. MongoDB 8.0 Community Edition on Ubuntu  
   <https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/>

2. Deploy a Self-Managed Replica Set  
   <https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/>

3. Deploy Self-Managed Replica Set with Keyfile Authentication  
   <https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-with-keyfile-access-control/>

4. X.509 Security and Member Certificate Requirements  
   <https://www.mongodb.com/docs/manual/core/security-x.509/>

5. Upgrade from Keyfile Authentication to X.509 Authentication  
   <https://www.mongodb.com/docs/manual/tutorial/upgrade-keyfile-to-x509/>

6. Security Checklist for Self-Managed Deployments  
   <https://www.mongodb.com/docs/manual/administration/security-checklist/>

7. Production Notes for Self-Managed Deployments  
   <https://www.mongodb.com/docs/manual/administration/production-notes/>

8. Operations Checklist for Self-Managed Deployments  
   <https://www.mongodb.com/docs/manual/administration/production-checklist-operations/>

9. Three-Member Replica Set Architecture  
   <https://www.mongodb.com/docs/manual/core/replica-set-architecture-three-members/>

10. MongoDB Versioning  
    <https://www.mongodb.com/docs/manual/reference/versioning/>

11. Transparent Huge Pages Guidance  
    <https://www.mongodb.com/docs/manual/tutorial/disable-transparent-huge-pages/>

12. Connection String Options  
    <https://www.mongodb.com/docs/manual/reference/connection-string-options/>

13. Write Concern  
    <https://www.mongodb.com/docs/manual/reference/write-concern/>

14. Backup Methods for Self-Managed Deployments  
    <https://www.mongodb.com/docs/manual/core/backups/>

---

## 31. Kết luận

Kiến trúc hoàn thành phải có trạng thái:

```text
rs0
├── mongo01.example.local:27017 — PRIMARY hoặc SECONDARY
├── mongo02.example.local:27017 — PRIMARY hoặc SECONDARY
└── mongo03.example.local:27017 — PRIMARY hoặc SECONDARY
```

Tại mọi thời điểm bình thường:

```text
1 PRIMARY + 2 SECONDARY
3 voting members
3 data-bearing members
majority = 2
```

Điểm cần giữ:

- Primary là vai trò động, không phải máy cố định.
- Application phải dùng seed list của cả ba node.
- `w=majority` cần được cấu hình và kiểm thử.
- Replica Set không thay thế backup.
- Keyfile giúp dựng cluster có access control nhưng X.509/TLS mới là đích bảo mật production được MongoDB khuyến nghị.
- Không đưa cluster vào production khi chưa test failover và restore.

