# Giải pháp truy cập Valkey Cluster bằng một domain

## 1. Mục tiêu

Mục tiêu là để lập trình viên chỉ cần biết một địa chỉ khởi tạo:

```text
valkey-dev.example.com:31000
```

Ví dụ với `ioredis`:

```js
const redis = new Redis.Cluster(
  [
    {
      host: "valkey-dev.example.com",
      port: 31000,
    },
  ],
  {
    redisOptions: {
      password: process.env.VALKEY_PASSWORD,
    },
  },
);
```

Địa chỉ trên chỉ là `startupNode`, hay còn gọi là seed node. Sau khi kết nối thành
công, cluster client sẽ đọc slot topology từ Valkey và tự kết nối tới các node
đang quản lý từng hash slot.

Dev không cần khai báo đủ sáu node. Tuy nhiên, toàn bộ endpoint mà Valkey trả về
trong topology vẫn phải truy cập được từ môi trường chạy ứng dụng.

## 2. Đặc điểm quan trọng của Valkey Cluster

Valkey Cluster không hoạt động giống một dịch vụ TCP thông thường.

Một cluster gồm nhiều node, và mỗi primary quản lý một nhóm hash slot. Client sẽ:

1. Kết nối tới một startup node.
2. Đọc topology bằng các lệnh cluster.
3. Tạo kết nối trực tiếp tới các node trong topology.
4. Gửi command tới node sở hữu hash slot tương ứng.
5. Đi theo phản hồi `MOVED` hoặc `ASK` khi topology thay đổi.

Ví dụ topology client cần nhìn thấy:

```text
valkey-dev.example.com:31000 -> node 0
valkey-dev.example.com:31001 -> node 1
valkey-dev.example.com:31002 -> node 2
valkey-dev.example.com:31003 -> node 3
valkey-dev.example.com:31004 -> node 4
valkey-dev.example.com:31005 -> node 5
```

Do đó, "một domain" là khả thi, nhưng mỗi node vẫn cần một endpoint phân biệt.
Trong thiết kế đề xuất, các node được phân biệt bằng port.

## 3. Trạng thái triển khai hiện tại

Cluster hiện có sáu pod StatefulSet:

```text
valkey-cluster-0
valkey-cluster-1
valkey-cluster-2
valkey-cluster-3
valkey-cluster-4
valkey-cluster-5
```

Headless Service cấp DNS ổn định cho từng pod:

```text
valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local
valkey-cluster-1.valkey-cluster-headless.valkey-cluster.svc.cluster.local
...
```

Ngoài ra, manifest `service-nodeport-dev.yaml` đã tạo một Service riêng cho từng
pod với mapping:

| Pod | Client NodePort | Cluster bus NodePort |
| --- | ---: | ---: |
| `valkey-cluster-0` | `31000` | `32000` |
| `valkey-cluster-1` | `31001` | `32001` |
| `valkey-cluster-2` | `31002` | `32002` |
| `valkey-cluster-3` | `31003` | `32003` |
| `valkey-cluster-4` | `31004` | `32004` |
| `valkey-cluster-5` | `31005` | `32005` |

Valkey hiện announce Kubernetes node IP lấy từ `status.hostIP`:

```conf
cluster-announce-ip ${VALKEY_ANNOUNCE_IP}
cluster-announce-port ${ANNOUNCE_PORT}
cluster-announce-bus-port ${ANNOUNCE_BUS_PORT}
```

Vì vậy, hiện tại có thể dùng domain cho startup node, nhưng sau khi đọc topology,
client vẫn chuyển sang các địa chỉ dạng:

```text
KUBERNETES_NODE_IP:31000
KUBERNETES_NODE_IP:31001
...
```

## 4. Vì sao không trỏ một Ingress trực tiếp vào headless Service?

Không nên triển khai:

```text
valkey-dev.example.com:6379
          |
          v
valkey-cluster-headless:6379
          |
          +-- pod 0
          +-- pod 1
          +-- pod 2
          +-- ...
```

Headless Service chứa endpoint của cả sáu pod. Nếu một TCP proxy hoặc load
balancer sử dụng service này như một backend chung, mỗi connection có thể được
đưa tới một pod khác nhau.

Điều này không cung cấp địa chỉ xác định cho từng node. Khi client nhận:

```text
MOVED <slot> <node-endpoint>
```

client cần kết nối đúng node sở hữu slot, không phải kết nối lại vào một endpoint
đang load-balance ngẫu nhiên qua toàn cluster.

Ngoài ra, Kubernetes Ingress thông thường xử lý HTTP/HTTPS theo host và path.
Valkey sử dụng TCP nên cần một trong các cơ chế:

- NGINX Ingress TCP services;
- Traefik `IngressRouteTCP`;
- Gateway API `TCPRoute`;
- HAProxy TCP frontend;
- hoặc Service loại `LoadBalancer`.

TCP passthrough chỉ chuyển connection. Nó không tự hiểu hash slot, `MOVED`,
`ASK` hoặc topology của Valkey Cluster.

## 5. Kiến trúc đề xuất

Sử dụng một domain và sáu TCP port:

```text
                         +-> :31000 -> service pod-0 -> valkey-cluster-0:6379
                         |
valkey-dev.example.com --+-> :31001 -> service pod-1 -> valkey-cluster-1:6379
                         |
                         +-> :31002 -> service pod-2 -> valkey-cluster-2:6379
                         |
                         +-> :31003 -> service pod-3 -> valkey-cluster-3:6379
                         |
                         +-> :31004 -> service pod-4 -> valkey-cluster-4:6379
                         |
                         +-> :31005 -> service pod-5 -> valkey-cluster-5:6379
```

Mỗi port ngoài phải luôn route tới đúng một pod.

Dev chỉ khai báo một startup node:

```text
valkey-dev.example.com:31000
```

Sau đó client tự khám phá năm endpoint còn lại từ topology.

### 5.1. Vai trò của headless Service

Tiếp tục giữ headless Service cho:

- network identity ổn định của StatefulSet;
- DNS riêng của từng pod;
- khởi tạo cluster;
- giao tiếp nội bộ khi cấu hình phù hợp;
- vận hành và troubleshooting trong Kubernetes.

Không dùng headless Service chung làm backend ngoài duy nhất cho toàn bộ client
traffic.

### 5.2. Service riêng cho từng pod

Mỗi pod cần một Service có selector cố định. Ví dụ pod 0:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: valkey-cluster-0
  namespace: valkey-cluster
spec:
  type: ClusterIP
  selector:
    app: valkey-cluster
    statefulset.kubernetes.io/pod-name: valkey-cluster-0
  ports:
    - name: client
      port: 6379
      targetPort: 6379
```

Tạo tương tự cho pod `1` đến pod `5`.

Nếu tiếp tục sử dụng NodePort hiện tại thì không bắt buộc tạo lại các Service
này. TCP load balancer có thể route tới các NodePort tương ứng. Nếu ingress
controller chạy bên trong cluster, sử dụng `ClusterIP` thường rõ ràng hơn.

### 5.3. TCP ingress hoặc load balancer

TCP ingress cần mở sáu listener:

| Listener ngoài | Backend |
| ---: | --- |
| `31000` | `valkey-cluster-0:6379` |
| `31001` | `valkey-cluster-1:6379` |
| `31002` | `valkey-cluster-2:6379` |
| `31003` | `valkey-cluster-3:6379` |
| `31004` | `valkey-cluster-4:6379` |
| `31005` | `valkey-cluster-5:6379` |

Ví dụ khái niệm với Traefik cho pod 0:

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRouteTCP
metadata:
  name: valkey-cluster-0
  namespace: valkey-cluster
spec:
  entryPoints:
    - valkey31000
  routes:
    - match: HostSNI(`*`)
      services:
        - name: valkey-cluster-0
          port: 6379
```

Cần thêm entry point và `IngressRouteTCP` tương ứng cho năm pod còn lại.

Manifest chính xác phụ thuộc ingress controller đang được cài trên RKE2. Không
nên áp dụng ví dụ Traefik nếu cluster đang dùng NGINX hoặc controller khác.

## 6. Cấu hình announce đề xuất

Valkey phải trả về hostname và port mà máy dev truy cập được:

```conf
cluster-announce-hostname valkey-dev.example.com
cluster-preferred-endpoint-type hostname
cluster-announce-port ${ANNOUNCE_PORT}
cluster-announce-bus-port ${ANNOUNCE_BUS_PORT}
```

Trong đó:

```text
ANNOUNCE_PORT = 31000 + pod ordinal
ANNOUNCE_BUS_PORT = 32000 + pod ordinal
```

Kết quả mong muốn khi client đọc topology:

```text
valkey-dev.example.com:31000
valkey-dev.example.com:31001
valkey-dev.example.com:31002
valkey-dev.example.com:31003
valkey-dev.example.com:31004
valkey-dev.example.com:31005
```

### Lưu ý về cluster bus

Cluster bus dùng cho giao tiếp node-to-node, không phải traffic ứng dụng.

Các node phải kết nối được tới đúng cluster bus endpoint của nhau. Trước khi đổi
announce từ node IP sang hostname ngoài, cần xác nhận:

- pod có resolve được `valkey-dev.example.com`;
- pod có route quay lại load balancer;
- load balancer có listener `32000-32005` nếu các node dùng endpoint ngoài;
- không xảy ra hairpin NAT hoặc firewall block;
- mỗi bus port luôn route tới đúng pod.

Nếu hạ tầng không hỗ trợ đường đi này, cần thiết kế riêng cách các node advertise
địa chỉ nội bộ và cách client dịch sang địa chỉ ngoài. Đây là lý do phần
cluster bus phải được kiểm thử trước khi rollout production.

## 7. Cấu hình Node.js sau khi triển khai

Code có thể rút gọn thành một startup node:

```js
const Redis = require("ioredis");

const host = process.env.VALKEY_HOST || "valkey-dev.example.com";
const port = Number(process.env.VALKEY_PORT || 31000);
const password = process.env.VALKEY_PASSWORD;

const redis = new Redis.Cluster(
  [{ host, port }],
  {
    slotsRefreshTimeout: 5000,
    clusterRetryStrategy(times) {
      return times <= 5 ? Math.min(times * 200, 1000) : null;
    },
    redisOptions: {
      password,
      connectTimeout: 5000,
    },
  },
);
```

Biến môi trường:

```env
VALKEY_HOST=valkey-dev.example.com
VALKEY_PORT=31000
VALKEY_PASSWORD=...
```

Nếu port được quy ước cố định trong cấu hình ứng dụng, dev chỉ cần nhập:

```env
VALKEY_HOST=valkey-dev.example.com
```

## 8. Các phương án khác

### 8.1. Một domain bootstrap, topology vẫn announce node IP

DNS domain trỏ tới một Kubernetes node:

```text
valkey-dev.example.com -> KUBERNETES_NODE_IP
```

Client chỉ dùng domain cho startup node, còn topology tiếp tục là
`nodeIP:NodePort`.

Ưu điểm:

- thay đổi ít nhất;
- dùng được ngay với manifest hiện tại.

Nhược điểm:

- máy dev phải route được tới tất cả Kubernetes node IP;
- node IP bị lộ cho ứng dụng;
- thay đổi node hoặc network có thể làm client mất kết nối.

### 8.2. Một domain riêng cho mỗi pod

Ví dụ:

```text
valkey-0.example.com:6379
valkey-1.example.com:6379
...
valkey-5.example.com:6379
```

Dev vẫn chỉ nhập một domain seed, nhưng topology trả về các domain còn lại.

Ưu điểm:

- tất cả node dùng port chuẩn `6379`;
- endpoint rõ ràng;
- thuận tiện hơn cho TLS.

Nhược điểm:

- cần nhiều DNS record;
- thường cần nhiều load balancer address hoặc frontend;
- vận hành phức tạp hơn.

### 8.3. DNS SRV

DNS SRV có thể cung cấp nhiều startup node qua một tên service. Phương án này
tăng khả năng bootstrap khi một seed bị lỗi.

DNS SRV chỉ giải quyết danh sách startup node. Nó không thay thế yêu cầu rằng
endpoint trong topology phải truy cập được, và không phải cluster client của mọi
ngôn ngữ đều hỗ trợ SRV giống nhau.

### 8.4. `natMap` tại client

`ioredis` hỗ trợ ánh xạ endpoint nội bộ sang endpoint ngoài:

```js
const redis = new Redis.Cluster(
  [{ host: "valkey-dev.example.com", port: 31000 }],
  {
    natMap: {
      "10.42.1.20:6379": {
        host: "valkey-dev.example.com",
        port: 31000,
      },
    },
    redisOptions: {
      password,
    },
  },
);
```

Phương án này hữu ích cho NAT hoặc tunnel nhưng làm logic hạ tầng rò vào code.
Mỗi client Node.js, Java hoặc ngôn ngữ khác có thể cần implementation riêng.

### 8.5. Cluster-aware proxy

Một proxy thật sự hiểu Valkey Cluster có thể cung cấp duy nhất:

```text
valkey-dev.example.com:6379
```

Proxy phải xử lý slot routing, topology, `MOVED`, `ASK`, failover, pipeline,
transaction và Pub/Sub.

NGINX TCP, Traefik TCP hoặc HAProxy TCP passthrough thông thường không phải
cluster-aware proxy. Chúng không thể biến sáu node thành một endpoint cluster
duy nhất chỉ bằng load balancing TCP.

Proxy cluster-aware làm kiến trúc phức tạp hơn, tăng latency và tạo thêm một lớp
cần high availability. Chỉ nên chọn khi tổ chức đã có sản phẩm proxy phù hợp và
đã kiểm chứng đầy đủ.

### 8.6. Sentinel thay cho Cluster

Nếu hệ thống chỉ cần high availability mà không cần sharding, có thể cân nhắc
Valkey primary/replica với Sentinel.

Sentinel đơn giản hơn cho yêu cầu một endpoint logic, nhưng không chia dữ liệu và
write load qua nhiều primary. Đây là thay đổi kiến trúc, không phải thay đổi
Ingress đơn thuần.

## 9. So sánh các phương án

| Phương án | Dev khai báo | Thay đổi hạ tầng | Độ phù hợp |
| --- | --- | --- | --- |
| Domain seed + node IP topology | Một domain seed | Thấp | Dev/test nhanh |
| Một domain + sáu port | Một domain và một seed port | Trung bình | Khuyến nghị cho kiến trúc hiện tại |
| Sáu domain riêng | Một domain seed | Cao | Production có LB/DNS đầy đủ |
| DNS SRV | Một service name | Trung bình | Tăng HA cho bootstrap |
| Client `natMap` | Một seed nhưng có mapping trong code | Thấp ở hạ tầng, cao ở client | Giải pháp chuyển tiếp |
| Cluster-aware proxy | Một domain, một port | Cao | Chỉ khi có proxy phù hợp |
| Sentinel | Một endpoint logic | Thay đổi kiến trúc | Khi không cần sharding |

## 10. Khuyến nghị

Với repository và manifest hiện tại, phương án nên xem xét đầu tiên là:

1. Giữ headless Service cho StatefulSet và giao tiếp nội bộ.
2. Giữ hoặc chuyển sáu service pod-specific sang `ClusterIP`.
3. Tạo TCP ingress/load balancer với sáu port `31000-31005`.
4. Route cố định mỗi port tới đúng một pod.
5. Cho Valkey announce `valkey-dev.example.com` cùng port riêng của node.
6. Chỉ khai báo `valkey-dev.example.com:31000` làm startup node trong ứng dụng.
7. Kiểm thử cluster bus, failover và khả năng kết nối từ cả bên trong lẫn bên
   ngoài Kubernetes trước khi rollout.

Không nên trỏ một listener TCP duy nhất vào headless Service chung, trừ khi lớp
đứng trước là một proxy thật sự hiểu Valkey Cluster.

## 11. Checklist kiểm thử trước khi áp dụng

- [ ] DNS `valkey-dev.example.com` resolve được từ máy dev.
- [ ] DNS cũng resolve được từ các pod Valkey.
- [ ] Port `31000-31005` mở từ mạng dev.
- [ ] Mỗi port luôn route tới đúng pod.
- [ ] Cluster bus giữa các node hoạt động.
- [ ] `CLUSTER INFO` trả về `cluster_state:ok`.
- [ ] `CLUSTER SLOTS` trả về hostname và port ngoài mong muốn.
- [ ] `CLUSTER NODES` không chứa endpoint mà client không truy cập được.
- [ ] Node.js kết nối thành công chỉ với một startup node.
- [ ] Java kết nối thành công chỉ với một startup node.
- [ ] SET/GET hoạt động trên key thuộc nhiều slot khác nhau.
- [ ] Client tự phục hồi sau khi xóa một primary pod.
- [ ] Replica được promote và topology client được refresh.
- [ ] TLS được kiểm thử nếu sử dụng `rediss`.
- [ ] NetworkPolicy và firewall chỉ mở đúng các nguồn cần thiết.

## 12. Tài liệu tham khảo

- Valkey Cluster specification:
  <https://valkey.io/topics/cluster-spec/>
- Valkey `CLUSTER SLOTS`:
  <https://valkey.io/commands/cluster-slots/>
- Valkey `CLUSTER NODES`:
  <https://valkey.io/commands/cluster-nodes/>
- ioredis Cluster và NAT mapping:
  <https://github.com/redis/ioredis#cluster>
- Kubernetes StatefulSet:
  <https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/>
