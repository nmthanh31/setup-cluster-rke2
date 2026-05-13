# Ansible Log Work - Kubernetes OS Baseline

Tài liệu này ghi lại trạng thái cấu hình, các thay đổi đã thực hiện và cách vận hành playbook Ansible trong repository `k8s-ansible`.

Ngày cập nhật gần nhất: 2026-05-13

## 1. Mục tiêu

Repository này dùng Ansible để chuẩn hóa hệ điều hành cho các VM trước khi triển khai Kubernetes. Các phần chính gồm:

- Cài package nền tảng cho Kubernetes.
- Cấu hình kernel module `overlay`, `br_netfilter`.
- Bật sysctl cần thiết cho Kubernetes networking.
- Tắt swap.
- Cấu hình SSH hardening và authorized key.
- Đồng bộ thời gian bằng `chrony`.
- Quản lý hostname và `/etc/hosts`.
- Cài kernel 6.x qua Ubuntu HWE kernel.
- Kiểm tra lại trạng thái node sau khi chạy.

## 2. Trạng thái playbook hiện tại

File điều phối chính: `site.yml`.

Trạng thái hiện tại trong `site.yml`:

```yaml
roles:
  # - role: assert
  #   tags: assert
  # - role: packages
  #   tags: packages
  # - role: kernel
  #   tags: kernel
  - role: kernel-6
    tags: kernel-6
  # - role: sysctl
  #   tags: sysctl
  # - role: ssh
  #   tags: ssh
  # - role: ntp
  #   tags: ntp
  # - role: hosts
  #   tags: hosts
  # - role: netplan
  #   tags: netplan
  # - role: verify
  #   tags: verify
```

Nghĩa là playbook hiện chỉ chạy role `kernel-6`. Các role baseline khác đang bị comment để tránh thay đổi ngoài phạm vi khi chỉ cần nâng kernel.

## 3. Inventory và host vars

Inventory chính:

```text
inventories/inventory.ini
```

Biến chung toàn cụm:

```text
group_vars/all.yml
```

Biến riêng từng host:

```text
host_vars/Kubernetes-web01.yml
host_vars/Kubernetes-web02.yml
host_vars/Kubernetes-web03.yml
host_vars/monitoring-web01.yml
host_vars/monitoring-web02.yml
host_vars/sonarqube-web.yml
```

Các file `host_vars` đang khai báo:

- `node_hostname`: hostname sẽ được set trên máy đích khi bật role `hosts`.
- `netplan_interface`: interface mạng, ví dụ `ens160`.
- `netplan_addresses`: IP tĩnh dạng CIDR.
- `netplan_gateway4`: gateway IPv4.

## 4. Log thay đổi đã thực hiện

### 4.1. Kiểm tra role `hosts`

Role: `roles/hosts/tasks/main.yml`

Role này làm các việc:

1. Set system hostname theo biến `node_hostname`.
2. Ghi block managed vào `/etc/hosts`.
3. Kiểm tra phân giải host bằng `getent hosts`.
4. In kết quả resolve ra log Ansible.

Block `/etc/hosts` được quản lý bằng marker:

```text
# BEGIN ANSIBLE MANAGED K8S HOSTS
# END ANSIBLE MANAGED K8S HOSTS
```

Nguồn dữ liệu mapping host lấy từ biến `k8s_hosts_entries` trong `group_vars/all.yml`, không lấy trực tiếp từ `inventory.ini`.

Mapping hiện tại:

```yaml
k8s_hosts_entries:
  - ip: "172.23.0.46"
    names:
      - "Kubernetes-worker01"
      - "k8s-wk01"
  - ip: "172.23.0.47"
    names:
      - "Kubernetes-cp01"
      - "k8s-cp01"
  - ip: "172.23.0.48"
    names:
      - "Kubernetes-cp02"
      - "k8s-cp02"
  - ip: "172.23.0.49"
    names:
      - "Kubernetes-worker02"
      - "k8s-wk02"
  - ip: "172.23.0.24"
    names:
      - "Kubernetes-cp03"
      - "k8s-cp03"
  - ip: "172.23.0.28"
    names:
      - "Kubernetes-worker03"
      - "k8s-wk03"
```

Lưu ý: tên inventory hiện có `monitoring-web01`, `monitoring-web02`, `sonarqube-web`, nhưng `/etc/hosts` lại đặt alias Kubernetes worker/control-plane. Cách này dùng được nếu 3 máy đó thực tế sẽ được dùng làm node Kubernetes. Nếu không, cần đổi lại alias cho đúng mục đích.

### 4.2. Chạy baseline thành công

Playbook đã từng chạy thành công toàn bộ baseline với kết quả:

```text
failed=0
unreachable=0
```

Các phần đã OK trong log chạy:

- OS Ubuntu 22.04 được assert hỗ trợ.
- Apt cache update thành công.
- Các package nền tảng đã có mặt.
- Module `overlay` và `br_netfilter` đã load được.
- Sysctl Kubernetes networking đã đúng:
  - `net.ipv4.ip_forward = 1`
  - `net.bridge.bridge-nf-call-iptables = 1`
  - `net.bridge.bridge-nf-call-ip6tables = 1`
- Swap đã được xử lý.
- Chrony active và system clock synchronized.
- `/etc/hosts` resolve đầy đủ các node.
- Verify cuối cùng trả về trạng thái OK.

### 4.3. SSH hardening và authorized key

Role: `roles/ssh`

File biến chính:

```text
group_vars/all.yml
```

Cấu hình SSH hiện tại:

```yaml
ssh_hardening_enabled: true
ssh_manage_authorized_keys: true
ssh_user: setup
ssh_authorized_keys:
  - "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICUcYr1UiNQY2Q5OdVdsHkJM/DkLJWjPxMLLBJu2G/EE cloud@key"
ssh_allow_users:
  - setup
ssh_port: 22
ssh_permit_root_login: "no"
ssh_password_authentication: "no"
ssh_pubkey_authentication: "yes"
ssh_kbd_interactive_authentication: "no"
ssh_challenge_response_authentication: "no"
ssh_x11_forwarding: "no"
ssh_allow_tcp_forwarding: "no"
ssh_max_auth_tries: 3
```

Role `ssh` sẽ:

1. Đảm bảo user `setup` tồn tại.
2. Tạo thư mục `/home/setup/.ssh` với mode `0700`.
3. Cài public key vào `authorized_keys`.
4. Ghi hardening config vào:

```text
/etc/ssh/sshd_config.d/99-hardening.conf
```

5. Validate SSH config bằng `sshd -t`.
6. Reload service `ssh`.

Nội dung hardening sẽ tắt password login:

```text
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AllowUsers setup
```

Lưu ý vận hành SSH:

- Trước khi bật lại role `ssh`, cần chắc chắn public key trong `ssh_authorized_keys` là key thật.
- Sau khi chạy SSH hardening, chỉ user `setup` được SSH vào nếu `AllowUsers setup` còn bật.
- Test đăng nhập từ terminal khác trước khi đóng session hiện tại:

```bash
ssh -i ~/.ssh/id_ed25519 setup@172.23.0.46
```

Các defaults cho role `ssh` đã được bổ sung trong `roles/ssh/defaults/main.yml` để tránh lỗi undefined variable khi một số biến trong `group_vars/all.yml` bị comment.

### 4.4. Assert SSH key

Ban đầu playbook fail vì `ssh_authorized_keys` còn placeholder:

```text
AAAA_REPLACE_WITH_REAL_PUBLIC_KEY
```

Task assert đã chặn đúng để tránh tình huống tắt password login nhưng chưa có key thật.

Hiện trong `roles/assert/tasks/main.yml`, phần assert SSH đang bị comment. Khi muốn bật lại hardening SSH an toàn, nên bật lại các task:

```yaml
- name: Assert SSH public key is provided before disabling passwords
  ansible.builtin.assert:
    that:
      - ssh_authorized_keys is defined
      - ssh_authorized_keys | length > 0
      - "'REPLACE_WITH_REAL_PUBLIC_KEY' not in (ssh_authorized_keys | join(' '))"
    fail_msg: "SSH hardening disables password auth, but ssh_authorized_keys is empty or still a placeholder."
  when:
    - ssh_hardening_enabled | bool
    - ssh_password_authentication == "no"
    - "'all' in ansible_run_tags or 'ssh' in ansible_run_tags or 'hardening' in ansible_run_tags"

- name: Assert SSH allow users includes SSH user
  ansible.builtin.assert:
    that:
      - ssh_allow_users is not defined or ssh_user in ssh_allow_users
    fail_msg: "ssh_allow_users is set but does not include ssh_user={{ ssh_user }}."
  when: ssh_hardening_enabled | bool
```

### 4.5. Kernel 6.x qua Ubuntu HWE

Đã thêm hai hướng cấu hình kernel 6.x:

1. Role `kernel` được mở rộng để có thể cài HWE kernel.
2. Role riêng `kernel-6` đang được `site.yml` dùng trực tiếp.

#### Role `kernel`

File defaults:

```text
roles/kernel/defaults/main.yml
```

Biến mới:

```yaml
k8s_hwe_kernel_enabled: false
k8s_hwe_kernel_reboot: false
k8s_hwe_kernel_packages:
  "22.04": linux-generic-hwe-22.04
  "24.04": linux-generic-hwe-24.04
```

File tasks:

```text
roles/kernel/tasks/main.yml
```

Logic mới:

1. Resolve package HWE theo Ubuntu version.
2. Cài package HWE kernel bằng apt.
3. Kiểm tra `/var/run/reboot-required`.
4. Reboot nếu `k8s_hwe_kernel_reboot: true`.
5. Load và persist module `overlay`, `br_netfilter`.

Trong `group_vars/all.yml` đã bật:

```yaml
k8s_hwe_kernel_enabled: true
k8s_hwe_kernel_reboot: false
```

#### Role `kernel-6`

File defaults:

```text
roles/kernel-6/defaults/main.yml
```

```yaml
kernel_6_reboot: true
kernel_6_package: "linux-generic-hwe-{{ ansible_distribution_version }}"
```

File tasks:

```text
roles/kernel-6/tasks/main.yml
```

Role này làm:

1. Update apt cache.
2. Cài HWE kernel package:

```yaml
name: "{{ kernel_6_package }}"
state: latest
install_recommends: true
```

3. Kiểm tra `/var/run/reboot-required`.
4. Reboot nếu `kernel_6_reboot: true`.
5. Chạy `uname -r`.
6. In kernel version hiện tại.

Với Ubuntu 22.04, package thực tế sẽ là:

```text
linux-generic-hwe-22.04
```

Sau reboot, kernel mong đợi là nhánh `6.x`, thường là `6.8.x` trên Ubuntu 22.04 HWE hiện tại.

## 5. Cách chạy

### 5.1. Chạy role kernel-6 hiện tại

Vì `site.yml` hiện chỉ bật `kernel-6`, chạy:

```bash
ansible-playbook -i inventories/inventory.ini site.yml
```

Hoặc chạy theo tag:

```bash
ansible-playbook -i inventories/inventory.ini site.yml --tags kernel-6
```

### 5.2. Chạy kernel-6 nhưng không tự reboot

Nếu muốn cài kernel trước, tự reboot sau:

```bash
ansible-playbook -i inventories/inventory.ini site.yml --tags kernel-6 -e kernel_6_reboot=false
```

Sau đó reboot thủ công bằng Ansible:

```bash
ansible all -i inventories/inventory.ini -b -m reboot
```

### 5.3. Kiểm tra kernel sau reboot

```bash
ansible all -i inventories/inventory.ini -m command -a "uname -r"
```

Kết quả mong đợi:

```text
6.x.x-xx-generic
```

Ví dụ:

```text
6.8.0-xx-generic
```

### 5.4. Bật lại baseline đầy đủ

Khi muốn chạy lại toàn bộ baseline, mở comment các role trong `site.yml`:

```yaml
roles:
  - role: assert
    tags: assert
  - role: packages
    tags: packages
  - role: kernel
    tags: kernel
  - role: sysctl
    tags: sysctl
  - role: ssh
    tags: ssh
  - role: ntp
    tags: ntp
  - role: hosts
    tags: hosts
  # - role: netplan
  #   tags: netplan
  - role: verify
    tags: verify
```

Khuyến nghị vẫn để `netplan` comment nếu đang SSH từ xa và chưa chắc cấu hình mạng tĩnh đã chính xác.

## 6. Cảnh báo và lưu ý

### 6.1. Ansible bỏ qua `ansible.cfg`

Log từng có cảnh báo:

```text
Ansible is being run in a world writable directory, ignoring it as an ansible.cfg source.
```

Nguyên nhân: thư mục project trên `/mnt/d/...` có quyền ghi quá rộng khi chạy từ WSL.

Cách xử lý trong WSL:

```bash
chmod go-w /mnt/d/Projects/ResourceCheck/k8s-ansible
```

Nếu vẫn còn cảnh báo do mount option của Windows drive, có thể chạy bằng cách chỉ định config:

```bash
ANSIBLE_CONFIG=./ansible.cfg ansible-playbook -i inventories/inventory.ini site.yml
```

### 6.2. Deprecation warning `INJECT_FACTS_AS_VARS`

Log từng có warning vì một số task dùng biến kiểu cũ:

```yaml
ansible_distribution
ansible_distribution_version
ansible_kernel
ansible_architecture
ansible_default_ipv4
ansible_swaptotal_mb
```

Nên đổi dần sang:

```yaml
ansible_facts["distribution"]
ansible_facts["distribution_version"]
ansible_facts["kernel"]
ansible_facts["architecture"]
ansible_facts["default_ipv4"]["address"]
ansible_facts["swaptotal_mb"]
```

Các file nên sửa sau:

- `roles/assert/tasks/main.yml`
- `roles/sysctl/tasks/main.yml`
- `roles/verify/tasks/main.yml`
- các role khác nếu còn dùng top-level facts.

### 6.3. Reboot sau kernel update

Cài kernel mới chưa đủ để kernel mới active. Phải reboot.

Kiểm tra node có yêu cầu reboot không:

```bash
ansible all -i inventories/inventory.ini -b -m stat -a "path=/var/run/reboot-required"
```

Kiểm tra kernel đang chạy:

```bash
ansible all -i inventories/inventory.ini -m command -a "uname -r"
```

### 6.4. SSH hardening có thể khóa truy cập

Nếu bật role `ssh` với:

```yaml
ssh_password_authentication: "no"
ssh_allow_users:
  - setup
```

thì chỉ user `setup` với private key tương ứng mới đăng nhập được. Cần test SSH trước khi đóng session quản trị hiện tại.

## 7. Checklist vận hành đề xuất

Trước khi chạy:

- Kiểm tra inventory đúng host.
- Kiểm tra SSH vào được tất cả node.
- Kiểm tra `ssh_authorized_keys` là public key thật.
- Nếu chỉ nâng kernel, giữ `site.yml` chỉ bật `kernel-6`.
- Nếu chạy baseline đầy đủ, cân nhắc vẫn comment `netplan` để tránh mất SSH.

Sau khi chạy:

- Kiểm tra recap không có `failed`.
- Nếu cài kernel mới, reboot node.
- Kiểm tra `uname -r` đã lên `6.x`.
- Kiểm tra lại SSH bằng user `setup`.
- Kiểm tra chrony active nếu đã chạy role `ntp`.
- Kiểm tra sysctl nếu đã chạy role `sysctl`.

## 8. Lệnh tham khảo nhanh

Syntax check:

```bash
ansible-playbook -i inventories/inventory.ini site.yml --syntax-check
```

Dry-run nếu role hỗ trợ check mode:

```bash
ansible-playbook -i inventories/inventory.ini site.yml --check --diff
```

Chạy kernel-6:

```bash
ansible-playbook -i inventories/inventory.ini site.yml --tags kernel-6
```

Reboot toàn bộ node:

```bash
ansible all -i inventories/inventory.ini -b -m reboot
```

Kiểm tra kernel:

```bash
ansible all -i inventories/inventory.ini -m command -a "uname -r"
```

Kiểm tra SSH config trên node:

```bash
ansible all -i inventories/inventory.ini -b -m command -a "sshd -t"
```

Kiểm tra resolve host:

```bash
ansible all -i inventories/inventory.ini -m command -a "getent hosts Kubernetes-cp01"
```

