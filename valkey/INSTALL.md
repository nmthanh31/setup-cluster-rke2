  # Hướng dẫn cài đặt Valkey Cluster và Valkey Admin

  Tài liệu này hướng dẫn cài đặt các manifest trong:

  - `valkey/cluster`: Valkey Cluster gồm 3 primary và 3 replica, truy cập bootstrap
    thông qua APISIX TCP/NodePort.
  - `valkey/admin`: giao diện Valkey Admin chạy nội bộ trong Kubernetes.

  Sau khi hoàn tất cài đặt, **Valkey Admin là giao diện vận hành chính**. Người vận
  hành sử dụng Valkey Admin để quan sát cluster, kiểm tra node, duyệt và quản lý
  key, chạy command phục vụ kiểm tra và theo dõi hoạt động hằng ngày. `kubectl` và
  `valkey-cli` trong tài liệu chủ yếu dành cho khởi tạo lần đầu, chẩn đoán khi
  Valkey Admin không truy cập được, hoặc thao tác hạ tầng/topology đặc biệt.

  Kiến trúc sau khi cài:

  ```text
  Ứng dụng bên ngoài
    -> <NODE_IP>:<APISIX_STREAM_NODEPORT>
    -> APISIX TCP listener :9000
    -> Service valkey-cluster-bootstrap:6379
    -> một trong các Valkey pod Ready
    -> cluster client tự đọc topology

  Valkey Admin
    -> Valkey Cluster trong namespace valkey-cluster
  ```

  > APISIX là endpoint bootstrap. Sau khi đọc topology, cluster client kết nối tới
  > các địa chỉ `NodeIP:31000-31005` do Valkey công bố.
  >
  > APISIX phục vụ traffic ứng dụng; Valkey Admin phục vụ vận hành cluster. Hai
  > thành phần có vai trò khác nhau.

  ## 1. Thành phần được triển khai

  | Thành phần | Giá trị |
  |---|---|
  | Namespace | `valkey-cluster` |
  | Valkey image | `valkey/valkey:9.1.0` |
  | Số pod | `6` |
  | Topology ban đầu | `3 primary + 3 replica` |
  | StorageClass | `longhorn` |
  | Dung lượng mỗi PVC | `2Gi` |
  | Cổng nội bộ Valkey | `6379` |
  | Cluster bus nội bộ | `16379` |
  | Client NodePort | `31000-31005` |
  | Cluster bus NodePort | `32000-32005` |
  | APISIX stream listener | `9000` |
  | Valkey Admin image | `valkey/valkey-admin:1.0.1` |

  ## 2. Điều kiện trước khi cài

  Cần có:

  - Kubernetes/RKE2 đang hoạt động;
  - `kubectl` đã trỏ đúng cluster;
  - StorageClass `longhorn`;
  - APISIX và APISIX Ingress Controller;
  - APISIX đã bật TCP stream listener port `9000`;
  - CRD `apisixroutes.apisix.apache.org`;
  - các NodePort `31000-31005` và `32000-32005` chưa bị sử dụng;
  - máy client truy cập được IP Kubernetes node.

  Kiểm tra:

  ```bash
  kubectl config current-context
  kubectl get nodes -o wide
  kubectl get storageclass longhorn
  kubectl get crd apisixroutes.apisix.apache.org
  kubectl get ingressclass apisix
  kubectl get pods,svc -A | grep apisix
  ```

  Kiểm tra APISIX có port `9000`:

  ```bash
  kubectl -n ingress-apisix get svc apisix-gateway
  ```

  Kết quả cần chứa dạng:

  ```text
  9000:<NODE_PORT>/TCP
  ```

  Ví dụ trên cluster hiện tại:

  ```text
  9000:31900/TCP
  ```

  ## 3. Tạo namespace và Secret

  Chạy tại thư mục gốc repository:

  ```bash
  kubectl apply -f valkey/cluster/namespace.yaml
  ```

  Tạo password bằng Secret. Không ghi password trực tiếp vào manifest:

  ```bash
  read -s -p "Valkey password: " VALKEY_PASSWORD
  echo

  kubectl -n valkey-cluster create secret generic valkey-cluster-auth \
    --from-literal=password="$VALKEY_PASSWORD" \
    --dry-run=client -o yaml |
  kubectl apply -f -

  unset VALKEY_PASSWORD
  ```

  Kiểm tra Secret tồn tại mà không in giá trị:

  ```bash
  kubectl -n valkey-cluster get secret valkey-cluster-auth
  ```

  ## 4. Cài Valkey Cluster

  Áp dụng ConfigMap, headless Service, các NodePort Service và StatefulSet:

  ```bash
  kubectl apply -f valkey/cluster/configmap.yaml
  kubectl apply -f valkey/cluster/service-headless.yaml
  kubectl apply -f valkey/cluster/service-nodeport-dev.yaml
  kubectl apply -f valkey/cluster/statefulset.yaml
  ```

  Chờ đủ sáu pod Ready:

  ```bash
  kubectl -n valkey-cluster rollout status \
    statefulset/valkey-cluster \
    --timeout=10m

  kubectl -n valkey-cluster get pods -o wide
  kubectl -n valkey-cluster get pvc
  kubectl -n valkey-cluster get svc
  ```

  Kết quả mong đợi:

  ```text
  valkey-cluster-0   1/1   Running
  valkey-cluster-1   1/1   Running
  valkey-cluster-2   1/1   Running
  valkey-cluster-3   1/1   Running
  valkey-cluster-4   1/1   Running
  valkey-cluster-5   1/1   Running
  ```

  ## 5. Khởi tạo topology lần đầu

  Chỉ thực hiện bước này khi cluster chưa được khởi tạo.

  Lấy password vào biến shell:

  ```bash
  VALKEY_PASSWORD="$(
    kubectl -n valkey-cluster get secret valkey-cluster-auth \
      -o jsonpath='{.data.password}' |
    base64 -d
  )"
  ```

  Tạo cluster:

  ```bash
  kubectl -n valkey-cluster exec -i valkey-cluster-0 -- sh -c '
    yes yes | valkey-cli \
      -a "$1" \
      --cluster create \
      valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
      valkey-cluster-1.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
      valkey-cluster-2.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
      valkey-cluster-3.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
      valkey-cluster-4.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
      valkey-cluster-5.valkey-cluster-headless.valkey-cluster.svc.cluster.local:6379 \
      --cluster-replicas 1
  ' sh "$VALKEY_PASSWORD"

  unset VALKEY_PASSWORD
  ```

  Không chạy lại `--cluster create` nếu cluster đã có topology. Kiểm tra:

  ```bash
  VALKEY_PASSWORD="$(
    kubectl -n valkey-cluster get secret valkey-cluster-auth \
      -o jsonpath='{.data.password}' |
    base64 -d
  )"

  kubectl -n valkey-cluster exec valkey-cluster-0 -- \
    valkey-cli -a "$VALKEY_PASSWORD" cluster info

  kubectl -n valkey-cluster exec valkey-cluster-0 -- \
    valkey-cli -a "$VALKEY_PASSWORD" cluster nodes

  unset VALKEY_PASSWORD
  ```

  Trạng thái đúng:

  ```text
  cluster_state:ok
  cluster_slots_assigned:16384
  cluster_slots_ok:16384
  cluster_known_nodes:6
  cluster_size:3
  ```

  ## 6. Cài endpoint bootstrap qua APISIX

  Tạo Service bootstrap chọn tất cả Valkey pod Ready:

  ```bash
  kubectl apply -f valkey/cluster/service-apisix-bootstrap.yaml
  ```

  Tạo APISIX TCP stream route:

  ```bash
  kubectl apply -f valkey/cluster/apisix-stream-route.yaml
  ```

  Kiểm tra:

  ```bash
  kubectl -n valkey-cluster get svc valkey-cluster-bootstrap

  kubectl -n valkey-cluster get endpointslice \
    -l kubernetes.io/service-name=valkey-cluster-bootstrap

  kubectl -n valkey-cluster get apisixroute \
    valkey-cluster-bootstrap \
    -o yaml
  ```

  `ApisixRoute` cần có:

  ```yaml
  status:
    conditions:
      - type: Accepted
        status: "True"
  ```

  Lấy APISIX NodePort:

  ```bash
  APISIX_NODE_PORT="$(
    kubectl -n ingress-apisix get svc apisix-gateway \
      -o jsonpath='{.spec.ports[?(@.port==9000)].nodePort}'
  )"

  echo "$APISIX_NODE_PORT"
  ```

  Lấy danh sách node IP:

  ```bash
  kubectl get nodes \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}'
  ```

  Endpoint startup có dạng:

  ```text
  <NODE_IP>:<APISIX_NODE_PORT>
  ```

  Ví dụ:

  ```text
  172.23.0.46:31900
  ```

  Vì APISIX Gateway dùng `externalTrafficPolicy: Cluster`, có thể gọi NodePort qua
  bất kỳ node IP nào đang truy cập được.

  ## 7. Cấu hình ứng dụng

  Ứng dụng bắt buộc dùng cluster-aware client. Ví dụ Node.js với `ioredis`:

  ```js
  const Redis = require("ioredis");

  const endpoint = process.env.VALKEY_STARTUP_ENDPOINT;
  const separator = endpoint.lastIndexOf(":");
  const host = endpoint.slice(0, separator);
  const port = Number(endpoint.slice(separator + 1));

  const valkey = new Redis.Cluster(
    [{ host, port }],
    {
      slotsRefreshTimeout: 5000,
      clusterRetryStrategy(times) {
        return Math.min(times * 200, 2000);
      },
      redisOptions: {
        password: process.env.VALKEY_PASSWORD,
        connectTimeout: 5000,
      },
    },
  );
  ```

  Chạy ví dụ có sẵn:

  ```bash
  cd valkey/dev
  npm install

  export VALKEY_STARTUP_ENDPOINT="172.23.0.46:31900"
  export VALKEY_PASSWORD="<password>"
  export VALKEY_KEY="dev:test"
  export VALKEY_VALUE="hello-valkey"

  npm start
  ```

  Chỉ `VALKEY_STARTUP_ENDPOINT` và `VALKEY_PASSWORD` là bắt buộc.

  ### Giới hạn của endpoint APISIX

  APISIX stream route là TCP bootstrap load balancer, không phải Valkey
  cluster-aware proxy. Sau bootstrap, `ioredis` đọc topology rồi kết nối trực tiếp
  tới:

  ```text
  NodeIP:31000
  NodeIP:31001
  ...
  NodeIP:31005
  ```

  Do đó:

  - firewall phải cho phép client truy cập `31000-31005`;
  - Valkey node cần tiếp tục announce Node IP và NodePort;
  - không được dùng client standalone;
  - một Node IP cố định không HA khi toàn bộ node đó mất mạng. Muốn một IP ổn định
    cần VIP, load balancer hoặc nhiều startup endpoint.

  ## 8. Cài giao diện vận hành Valkey Admin

  Valkey Admin là giao diện vận hành chính của bộ cài này. Valkey Admin đọc
  password từ Secret `valkey-cluster-auth`; manifest không chứa password dạng rõ.

  Kiểm tra trước:

  ```bash
  kubectl -n valkey-cluster get secret valkey-cluster-auth
  kubectl -n valkey-cluster get pods -l app=valkey-cluster
  ```

  Cài:

  ```bash
  kubectl apply -f valkey/admin/valkey-admin.yaml

  kubectl -n valkey-cluster rollout status \
    deployment/valkey-admin \
    --timeout=5m

  kubectl -n valkey-cluster get pod,service \
    -l app.kubernetes.io/name=valkey-admin
  ```

  Xem log:

  ```bash
  kubectl -n valkey-cluster logs \
    deployment/valkey-admin \
    --tail=100
  ```

  Mở giao diện cục bộ:

  ```bash
  kubectl -n valkey-cluster port-forward \
    service/valkey-admin \
    8080:8080
  ```

  Truy cập:

  ```text
  http://localhost:8080
  ```

  Sau khi đăng nhập/kết nối thành công, sử dụng Valkey Admin cho các hoạt động
  thường xuyên:

  - kiểm tra trạng thái và topology cluster;
  - quan sát primary, replica và các node đang kết nối;
  - duyệt, tìm kiếm và kiểm tra key;
  - xem kiểu dữ liệu, TTL và giá trị của key;
  - tạo, cập nhật hoặc xóa key theo quyền vận hành;
  - chạy command phục vụ kiểm tra;
  - theo dõi cluster sau khi pod restart hoặc xảy ra failover.

  Quy trình vận hành thông thường:

  ```text
  Người vận hành
    -> kubectl port-forward hoặc cổng truy cập nội bộ đã được bảo vệ
    -> Valkey Admin
    -> Valkey Cluster
  ```

  Không expose Valkey Admin công khai khi chưa có TLS, OIDC/OAuth2, giới hạn
  IP/VPN và kiểm soát truy cập. Giao diện admin có quyền xem, sửa key và thực thi
  command.

  ## 9. Phân định thao tác vận hành

  ### Thực hiện trên Valkey Admin

  Valkey Admin được ưu tiên cho:

  - giám sát và kiểm tra trạng thái cluster hằng ngày;
  - kiểm tra node và vai trò primary/replica;
  - quản lý key, TTL và dữ liệu;
  - chạy command kiểm tra được đơn vị cho phép;
  - xác nhận cluster đã ổn định sau rollout hoặc failover;
  - hỗ trợ điều tra lỗi ứng dụng liên quan tới dữ liệu Valkey.

  ### Thực hiện bằng `kubectl` hoặc `valkey-cli`

  Chỉ sử dụng công cụ dòng lệnh cho:

  - cài đặt hoặc gỡ cài đặt manifest;
  - khởi tạo topology bằng `--cluster create`;
  - xem log, event, probe, PVC và tình trạng pod;
  - restart hoặc thay đổi tài nguyên Kubernetes;
  - xử lý khi Valkey Admin không hoạt động;
  - reshard, add/remove node và các thay đổi topology chưa được Valkey Admin hỗ
    trợ đầy đủ;
  - thu thập bằng chứng phục vụ chẩn đoán sự cố.

  Không dùng `kubectl scale statefulset` như một thao tác vận hành cluster thông
  thường. Scale Valkey cần quy trình topology riêng.

  ## 10. Kiểm tra failover cơ bản

  Xem topology trước khi thử:

  ```bash
  VALKEY_PASSWORD="$(
    kubectl -n valkey-cluster get secret valkey-cluster-auth \
      -o jsonpath='{.data.password}' |
    base64 -d
  )"

  kubectl -n valkey-cluster exec valkey-cluster-0 -- \
    valkey-cli -a "$VALKEY_PASSWORD" cluster nodes
  ```

  Xác định một primary rồi xóa đúng pod đó:

  ```bash
  kubectl -n valkey-cluster delete pod <PRIMARY_POD>
  kubectl -n valkey-cluster get pods -w
  ```

  Kiểm tra topology sau failover:

  ```bash
  kubectl -n valkey-cluster exec valkey-cluster-1 -- \
    valkey-cli -a "$VALKEY_PASSWORD" cluster info

  kubectl -n valkey-cluster exec valkey-cluster-1 -- \
    valkey-cli -a "$VALKEY_PASSWORD" cluster nodes

  unset VALKEY_PASSWORD
  ```

  Replica của primary lỗi cần được promote và `cluster_state` phải trở lại `ok`.

  Sau khi cluster trở lại `ok`, mở Valkey Admin để xác nhận topology, primary mới
  và khả năng truy cập dữ liệu. Đây là bước xác nhận vận hành cuối cùng.

  ## 11. Chẩn đoán

  ### APISIX route không được chấp nhận

  ```bash
  kubectl -n valkey-cluster describe \
    apisixroute valkey-cluster-bootstrap

  kubectl -n ingress-apisix logs \
    deployment/apisix-ingress-controller \
    --all-containers \
    --tail=200
  ```

  Kiểm tra APISIX đã mở stream port `9000`:

  ```bash
  kubectl -n ingress-apisix get svc apisix-gateway
  ```

  ### Bootstrap kết nối được nhưng SET/GET lỗi

  Kiểm tra topology Valkey đang announce:

  ```bash
  VALKEY_PASSWORD="$(
    kubectl -n valkey-cluster get secret valkey-cluster-auth \
      -o jsonpath='{.data.password}' |
    base64 -d
  )"

  kubectl -n valkey-cluster exec valkey-cluster-0 -- \
    valkey-cli -a "$VALKEY_PASSWORD" cluster nodes

  unset VALKEY_PASSWORD
  ```

  Đảm bảo máy client route được tới các node IP và port `31000-31005`.

  ### Pod Valkey không khởi động

  ```bash
  kubectl -n valkey-cluster describe pod <POD_NAME>
  kubectl -n valkey-cluster logs <POD_NAME>
  kubectl -n valkey-cluster get pvc
  kubectl get storageclass longhorn
  ```

  ### Valkey Admin không kết nối được

  ```bash
  kubectl -n valkey-cluster describe pod \
    -l app.kubernetes.io/name=valkey-admin

  kubectl -n valkey-cluster logs \
    deployment/valkey-admin \
    --tail=200
  ```

  Valkey Admin phải truy cập được các Node IP và NodePort mà cluster công bố.

  ## 12. Cập nhật cấu hình

  Sau khi thay `configmap.yaml`, restart StatefulSet theo từng pod:

  ```bash
  kubectl apply -f valkey/cluster/configmap.yaml
  kubectl -n valkey-cluster rollout restart statefulset/valkey-cluster
  kubectl -n valkey-cluster rollout status statefulset/valkey-cluster
  ```

  Theo dõi `cluster info` trong quá trình rollout. Không restart đồng thời toàn bộ
  pod ngoài sự kiểm soát của StatefulSet.

  Không scale Valkey Cluster chỉ bằng:

  ```bash
  kubectl scale statefulset valkey-cluster --replicas=<N>
  ```

  Pod mới không tự nhận slot hoặc vai trò replica. Scale up/down cần quy trình
  `CLUSTER MEET`, gán replica, reshard và remove node, hoặc một operator đã được
  kiểm chứng.

  Sau rollout, kiểm tra lại cluster trên Valkey Admin. Chỉ dùng `cluster info` và
  `cluster nodes` khi cần đối chiếu hoặc khi giao diện admin không truy cập được.

  ## 13. Gỡ cài đặt

  Gỡ Valkey Admin:

  ```bash
  kubectl delete -f valkey/admin/valkey-admin.yaml
  ```

  Gỡ APISIX route và bootstrap Service:

  ```bash
  kubectl delete -f valkey/cluster/apisix-stream-route.yaml
  kubectl delete -f valkey/cluster/service-apisix-bootstrap.yaml
  ```

  Gỡ workload và Service Valkey:

  ```bash
  kubectl delete -f valkey/cluster/statefulset.yaml
  kubectl delete -f valkey/cluster/service-nodeport-dev.yaml
  kubectl delete -f valkey/cluster/service-headless.yaml
  kubectl delete -f valkey/cluster/configmap.yaml
  ```

  PVC chứa dữ liệu không nhất thiết bị xóa cùng StatefulSet. Kiểm tra trước khi
  xóa:

  ```bash
  kubectl -n valkey-cluster get pvc
  ```

  Chỉ xóa PVC hoặc namespace khi chắc chắn không cần dữ liệu:

  ```bash
  kubectl delete namespace valkey-cluster
  ```

Lệnh cuối cùng xóa toàn bộ resource trong namespace, bao gồm Secret và có thể
bao gồm PVC tùy chính sách lưu trữ. Không chạy trong production nếu chưa backup
và xác nhận phạm vi ảnh hưởng.

## Phụ lục A: Danh sách manifest

Các manifest được sử dụng trong hướng dẫn:

| Thứ tự | File | Resource | Mục đích |
|---:|---|---|---|
| 1 | `cluster/namespace.yaml` | `Namespace` | Tạo namespace `valkey-cluster` |
| 2 | `cluster/configmap.yaml` | `ConfigMap` | Sinh `valkey.conf` cho từng pod |
| 3 | `cluster/service-headless.yaml` | Headless `Service` | DNS và network identity của StatefulSet |
| 4 | `cluster/service-nodeport-dev.yaml` | 6 `Service` NodePort | Công bố endpoint riêng của từng node |
| 5 | `cluster/statefulset.yaml` | `StatefulSet` | Chạy 6 pod Valkey và tạo PVC |
| 6 | `cluster/service-apisix-bootstrap.yaml` | `Service` ClusterIP | Gom các pod Ready làm bootstrap upstream |
| 7 | `cluster/apisix-stream-route.yaml` | `ApisixRoute` | Chuyển TCP port `9000` tới bootstrap Service |
| 8 | `admin/valkey-admin.yaml` | `Deployment`, `Service` | Giao diện vận hành Valkey Admin |

Secret không được lưu thành file để tránh commit password. Secret được tạo bằng
`kubectl create secret` như phần 3.

### A.1. Namespace

File `valkey/cluster/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: valkey-cluster
```

### A.2. ConfigMap cấu hình Valkey

File `valkey/cluster/configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: valkey-cluster-config
  namespace: valkey-cluster
data:
  start-valkey-cluster.sh: |
    #!/bin/sh
    set -e

    PASSWORD="$(cat /etc/valkey-secret/password)"
    POD_NAME="$(hostname)"
    POD_ORDINAL="${POD_NAME##*-}"
    ANNOUNCE_PORT="$((31000 + POD_ORDINAL))"
    ANNOUNCE_BUS_PORT="$((32000 + POD_ORDINAL))"

    : "${VALKEY_ANNOUNCE_IP:?VALKEY_ANNOUNCE_IP is required}"

    cat > /data/valkey.conf <<CONF
    port 6379
    bind 0.0.0.0
    protected-mode no

    requirepass ${PASSWORD}
    masterauth ${PASSWORD}

    dir /data
    appendonly yes
    appendfsync everysec

    cluster-enabled yes
    cluster-config-file /data/nodes.conf
    cluster-node-timeout 5000

    cluster-announce-ip ${VALKEY_ANNOUNCE_IP}
    cluster-announce-port ${ANNOUNCE_PORT}
    cluster-announce-bus-port ${ANNOUNCE_BUS_PORT}

    tcp-keepalive 60
    timeout 0
    logfile ""
    CONF

    exec valkey-server /data/valkey.conf
```

Mỗi pod tính client NodePort và cluster-bus NodePort từ ordinal. Ví dụ pod `0`
announce `31000`/`32000`, pod `5` announce `31005`/`32005`.

### A.3. Headless Service

File `valkey/cluster/service-headless.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: valkey-cluster-headless
  namespace: valkey-cluster
spec:
  clusterIP: None
  selector:
    app: valkey-cluster
  ports:
    - name: client
      port: 6379
      targetPort: 6379
    - name: cluster-bus
      port: 16379
      targetPort: 16379
```

Service này tạo DNS cố định:

```text
valkey-cluster-0.valkey-cluster-headless.valkey-cluster.svc.cluster.local
...
valkey-cluster-5.valkey-cluster-headless.valkey-cluster.svc.cluster.local
```

### A.4. NodePort Service cho từng Valkey node

File `valkey/cluster/service-nodeport-dev.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: valkey-cluster-0-nodeport
  namespace: valkey-cluster
  labels:
    app: valkey-cluster
    access: dev-nodeport
spec:
  type: NodePort
  selector:
    app: valkey-cluster
    statefulset.kubernetes.io/pod-name: valkey-cluster-0
  ports:
    - name: client
      port: 6379
      targetPort: 6379
      nodePort: 31000
    - name: cluster-bus
      port: 16379
      targetPort: 16379
      nodePort: 32000
---
apiVersion: v1
kind: Service
metadata:
  name: valkey-cluster-1-nodeport
  namespace: valkey-cluster
  labels:
    app: valkey-cluster
    access: dev-nodeport
spec:
  type: NodePort
  selector:
    app: valkey-cluster
    statefulset.kubernetes.io/pod-name: valkey-cluster-1
  ports:
    - name: client
      port: 6379
      targetPort: 6379
      nodePort: 31001
    - name: cluster-bus
      port: 16379
      targetPort: 16379
      nodePort: 32001
---
apiVersion: v1
kind: Service
metadata:
  name: valkey-cluster-2-nodeport
  namespace: valkey-cluster
  labels:
    app: valkey-cluster
    access: dev-nodeport
spec:
  type: NodePort
  selector:
    app: valkey-cluster
    statefulset.kubernetes.io/pod-name: valkey-cluster-2
  ports:
    - name: client
      port: 6379
      targetPort: 6379
      nodePort: 31002
    - name: cluster-bus
      port: 16379
      targetPort: 16379
      nodePort: 32002
---
apiVersion: v1
kind: Service
metadata:
  name: valkey-cluster-3-nodeport
  namespace: valkey-cluster
  labels:
    app: valkey-cluster
    access: dev-nodeport
spec:
  type: NodePort
  selector:
    app: valkey-cluster
    statefulset.kubernetes.io/pod-name: valkey-cluster-3
  ports:
    - name: client
      port: 6379
      targetPort: 6379
      nodePort: 31003
    - name: cluster-bus
      port: 16379
      targetPort: 16379
      nodePort: 32003
---
apiVersion: v1
kind: Service
metadata:
  name: valkey-cluster-4-nodeport
  namespace: valkey-cluster
  labels:
    app: valkey-cluster
    access: dev-nodeport
spec:
  type: NodePort
  selector:
    app: valkey-cluster
    statefulset.kubernetes.io/pod-name: valkey-cluster-4
  ports:
    - name: client
      port: 6379
      targetPort: 6379
      nodePort: 31004
    - name: cluster-bus
      port: 16379
      targetPort: 16379
      nodePort: 32004
---
apiVersion: v1
kind: Service
metadata:
  name: valkey-cluster-5-nodeport
  namespace: valkey-cluster
  labels:
    app: valkey-cluster
    access: dev-nodeport
spec:
  type: NodePort
  selector:
    app: valkey-cluster
    statefulset.kubernetes.io/pod-name: valkey-cluster-5
  ports:
    - name: client
      port: 6379
      targetPort: 6379
      nodePort: 31005
    - name: cluster-bus
      port: 16379
      targetPort: 16379
      nodePort: 32005
```

Mỗi Service chọn đúng một pod. Không thay selector này bằng selector chung vì
topology cần endpoint riêng, ổn định cho từng Valkey node.

### A.5. StatefulSet Valkey

File `valkey/cluster/statefulset.yaml`:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: valkey-cluster
  namespace: valkey-cluster
spec:
  serviceName: valkey-cluster-headless
  replicas: 6
  selector:
    matchLabels:
      app: valkey-cluster
  template:
    metadata:
      labels:
        app: valkey-cluster
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: valkey
          image: valkey/valkey:9.1.0
          imagePullPolicy: IfNotPresent
          env:
            - name: VALKEY_ANNOUNCE_IP
              valueFrom:
                fieldRef:
                  fieldPath: status.hostIP
          command:
            - /bin/sh
            - /scripts/start-valkey-cluster.sh
          ports:
            - name: client
              containerPort: 6379
            - name: cluster-bus
              containerPort: 16379
          volumeMounts:
            - name: scripts
              mountPath: /scripts
            - name: data
              mountPath: /data
            - name: valkey-auth
              mountPath: /etc/valkey-secret
              readOnly: true
          readinessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - valkey-cli -a "$(cat /etc/valkey-secret/password)" ping | grep PONG
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
          livenessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - valkey-cli -a "$(cat /etc/valkey-secret/password)" ping | grep PONG
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 3
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 512Mi
      volumes:
        - name: scripts
          configMap:
            name: valkey-cluster-config
            defaultMode: 0755
        - name: valkey-auth
          secret:
            secretName: valkey-cluster-auth
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: longhorn
        resources:
          requests:
            storage: 2Gi
```

`VALKEY_ANNOUNCE_IP` lấy `status.hostIP` để cluster client bên ngoài Kubernetes
truy cập được topology thông qua NodePort.

### A.6. APISIX bootstrap Service

File `valkey/cluster/service-apisix-bootstrap.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: valkey-cluster-bootstrap
  namespace: valkey-cluster
  labels:
    app: valkey-cluster
    access: apisix-bootstrap
spec:
  type: ClusterIP
  selector:
    app: valkey-cluster
  ports:
    - name: client
      protocol: TCP
      port: 6379
      targetPort: 6379
```

Service này chọn tất cả Valkey pod Ready. Nó chỉ phục vụ bootstrap; không thay
thế các Service NodePort riêng của từng node.

### A.7. APISIX TCP stream route

File `valkey/cluster/apisix-stream-route.yaml`:

```yaml
apiVersion: apisix.apache.org/v2
kind: ApisixRoute
metadata:
  name: valkey-cluster-bootstrap
  namespace: valkey-cluster
spec:
  ingressClassName: apisix
  stream:
    - name: valkey-cluster-bootstrap
      protocol: TCP
      match:
        ingressPort: 9000
      backend:
        serviceName: valkey-cluster-bootstrap
        servicePort: 6379
        resolveGranularity: endpoint
```

APISIX phải được cấu hình sẵn để lắng nghe TCP port `9000`. Kubernetes không tự
mở listener APISIX chỉ vì `ApisixRoute` được tạo.

### A.8. Valkey Admin

File `valkey/admin/valkey-admin.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: valkey-admin
  namespace: valkey-cluster
  labels:
    app.kubernetes.io/name: valkey-admin
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app.kubernetes.io/name: valkey-admin
  template:
    metadata:
      labels:
        app.kubernetes.io/name: valkey-admin
    spec:
      containers:
        - name: valkey-admin
          image: valkey/valkey-admin:1.0.1
          imagePullPolicy: IfNotPresent
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "8080"
            - name: DEPLOYMENT_MODE
              value: Web
            - name: VALKEY_HOST
              value: valkey-cluster-0-nodeport.valkey-cluster.svc.cluster.local
            - name: VALKEY_PORT
              value: "6379"
            - name: VALKEY_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: valkey-cluster-auth
                  key: password
            - name: VALKEY_TLS
              value: "false"
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 6
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 30
            periodSeconds: 20
            timeoutSeconds: 3
            failureThreshold: 3
---
apiVersion: v1
kind: Service
metadata:
  name: valkey-admin
  namespace: valkey-cluster
  labels:
    app.kubernetes.io/name: valkey-admin
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: valkey-admin
  ports:
    - name: http
      port: 8080
      targetPort: http
      protocol: TCP
```

Password được lấy từ Secret. Valkey Admin là giao diện vận hành chính; Service
để `ClusterIP` nhằm tránh công khai giao diện quản trị trực tiếp ra ngoài.

## Phụ lục B: Áp dụng toàn bộ manifest

Sau khi đã tạo Secret, có thể áp dụng các manifest theo thứ tự:

```bash
kubectl apply -f valkey/cluster/configmap.yaml
kubectl apply -f valkey/cluster/service-headless.yaml
kubectl apply -f valkey/cluster/service-nodeport-dev.yaml
kubectl apply -f valkey/cluster/statefulset.yaml

kubectl -n valkey-cluster rollout status \
  statefulset/valkey-cluster \
  --timeout=10m

# Chỉ chạy quy trình --cluster create nếu cluster chưa được khởi tạo.

kubectl apply -f valkey/cluster/service-apisix-bootstrap.yaml
kubectl apply -f valkey/cluster/apisix-stream-route.yaml
kubectl apply -f valkey/admin/valkey-admin.yaml
```

Không áp dụng Valkey Admin trước Secret vì Deployment cần
`valkey-cluster-auth/password`.
