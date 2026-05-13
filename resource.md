# VM 1

===== BASIC =====
```bash
Kubernetes-web01
172.23.0.46
PRETTY_NAME="Ubuntu 22.04.4 LTS"
5.15.0-176-generic
up 2 weeks, 5 days, 18 hours, 5 minutes
```
===== CPU =====
```bash
8
CPU(s):                                  8
On-line CPU(s) list:                     0-7
Model name:                              Intel(R) Xeon(R) CPU E5-2697 v4 @ 2.30GHz
Thread(s) per core:                      1
Core(s) per socket:                      8
Socket(s):                               1
NUMA node0 CPU(s):                       0-7
```
===== RAM =====
```bash
               total        used        free      shared  buff/cache   available
Mem:            15Gi       428Mi        12Gi       1.0Mi       2.4Gi        14Gi
Swap:          3.8Gi          0B       3.8Gi
```
===== DISK =====
```bash
Filesystem                         Size  Used Avail Use% Mounted on
/dev/mapper/ubuntu--vg-ubuntu--lv   77G  8.3G   65G  12% /
NAME                       SIZE TYPE FSTYPE      MOUNTPOINT
loop0                     63.8M loop squashfs    /snap/core20/2717
loop1                     63.8M loop squashfs    /snap/core20/2769
loop2                     91.7M loop squashfs    /snap/lxd/38469
loop3                     91.7M loop squashfs    /snap/lxd/38800
loop5                     48.4M loop squashfs    /snap/snapd/26382
loop6                     49.3M loop squashfs    /snap/snapd/26865
sda                        200G disk
├─sda1                       1M part
├─sda2                       2G part ext4        /boot
├─sda3                      78G part LVM2_member
│ └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
└─sda4                     120G part LVM2_member
  └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
sr0                       1024M rom
```
===== NETWORK =====
```bash
lo               UNKNOWN        127.0.0.1/8 ::1/128
ens160           UP             172.23.0.46/24 fe80::250:56ff:fea7:650e/64
default via 172.23.0.126 dev ens160 proto static
172.23.0.0/24 dev ens160 proto kernel scope link src 172.23.0.46
```
===== K8S CHECK =====
```bash
net.ipv4.ip_forward = 0
```
# VM 2
===== BASIC =====
```bash
kubernetes-web02
172.23.0.47
PRETTY_NAME="Ubuntu 22.04.4 LTS"
5.15.0-171-generic
up 4 weeks, 6 days, 4 hours, 48 minutes
```
===== CPU =====
```bash
8
CPU(s):                                  8
On-line CPU(s) list:                     0-7
Model name:                              Intel(R) Xeon(R) CPU E5-2697 v4 @ 2.30GHz
Thread(s) per core:                      1
Core(s) per socket:                      4
Socket(s):                               2
NUMA node0 CPU(s):                       0-7
```
===== RAM =====
```bash
               total        used        free      shared  buff/cache   available
Mem:           7.7Gi       413Mi       4.7Gi       1.0Mi       2.6Gi       7.0Gi
Swap:          3.8Gi          0B       3.8Gi
```
===== DISK =====
```bash
Filesystem                         Size  Used Avail Use% Mounted on
/dev/mapper/ubuntu--vg-ubuntu--lv   77G  8.4G   64G  12% /
NAME                       SIZE TYPE FSTYPE      MOUNTPOINT
loop0                     91.7M loop squashfs    /snap/lxd/38800
loop1                     63.8M loop squashfs    /snap/core20/2717
loop2                     49.3M loop squashfs    /snap/snapd/26865
loop3                     91.7M loop squashfs    /snap/lxd/38469
loop4                     63.8M loop squashfs    /snap/core20/2769
loop6                     48.4M loop squashfs    /snap/snapd/26382
sda                        200G disk
├─sda1                       1M part
├─sda2                       2G part ext4        /boot
├─sda3                      78G part LVM2_member
│ └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
└─sda4                     120G part LVM2_member
  └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
sr0                       1024M rom
```
===== NETWORK =====
```bash
lo               UNKNOWN        127.0.0.1/8 ::1/128
ens160           UP             172.23.0.47/24 fe80::250:56ff:fea7:112a/64
default via 172.23.0.126 dev ens160 proto static
172.23.0.0/24 dev ens160 proto kernel scope link src 172.23.0.47
```
===== K8S CHECK =====
```bash
net.ipv4.ip_forward = 0
```
# VM 3
===== BASIC =====
```bash
Kubernetes-web03
172.23.0.48
PRETTY_NAME="Ubuntu 22.04.4 LTS"
5.15.0-171-generic
up 4 weeks, 6 days, 4 hours, 47 minutes
```
===== CPU =====
```bash
8
CPU(s):                                  8
On-line CPU(s) list:                     0-7
Model name:                              Intel(R) Xeon(R) CPU E5-2697 v4 @ 2.30GHz
Thread(s) per core:                      1
Core(s) per socket:                      4
Socket(s):                               2
NUMA node0 CPU(s):                       0-7
```
===== RAM =====
```bash
               total        used        free      shared  buff/cache   available
Mem:           7.7Gi       407Mi       4.5Gi       1.0Mi       2.8Gi       7.0Gi
Swap:          3.8Gi          0B       3.8Gi
```
===== DISK =====
```bash
Filesystem                         Size  Used Avail Use% Mounted on
/dev/mapper/ubuntu--vg-ubuntu--lv   77G  8.4G   64G  12% /
NAME                       SIZE TYPE FSTYPE      MOUNTPOINT
loop0                     63.8M loop squashfs    /snap/core20/2717
loop1                     63.8M loop squashfs    /snap/core20/2769
loop2                     49.3M loop squashfs    /snap/snapd/26865
loop3                     91.7M loop squashfs    /snap/lxd/38469
loop5                     48.4M loop squashfs    /snap/snapd/26382
loop6                     91.7M loop squashfs    /snap/lxd/38800
sda                        200G disk
├─sda1                       1M part
├─sda2                       2G part ext4        /boot
├─sda3                      78G part LVM2_member
│ └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
└─sda4                     120G part LVM2_member
  └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
sr0                       1024M rom
```
===== NETWORK =====
```bash
lo               UNKNOWN        127.0.0.1/8 ::1/128
ens160           UP             172.23.0.48/24 fe80::250:56ff:fea7:4a4e/64
default via 172.23.0.126 dev ens160 proto static
172.23.0.0/24 dev ens160 proto kernel scope link src 172.23.0.48
```
===== K8S CHECK =====
```bash
net.ipv4.ip_forward = 0
```
# VM 4
===== BASIC =====
```bash
monitoring-web01
172.23.0.49
PRETTY_NAME="Ubuntu 22.04.4 LTS"
5.15.0-176-generic
up 2 weeks, 5 days, 18 hours, 7 minutes
```
===== CPU =====
```bash
8
CPU(s):                                  8
On-line CPU(s) list:                     0-7
Model name:                              Intel(R) Xeon(R) CPU E5-2697 v4 @ 2.30GHz
Thread(s) per core:                      1
Core(s) per socket:                      8
Socket(s):                               1
NUMA node0 CPU(s):                       0-7
```
===== RAM =====
```bash
               total        used        free      shared  buff/cache   available
Mem:            15Gi       418Mi        12Gi       1.0Mi       2.3Gi        14Gi
Swap:          3.8Gi          0B       3.8Gi
```
===== DISK =====
```bash
Filesystem                         Size  Used Avail Use% Mounted on
/dev/mapper/ubuntu--vg-ubuntu--lv   77G  8.3G   65G  12% /
NAME                       SIZE TYPE FSTYPE      MOUNTPOINT
loop0                     63.8M loop squashfs    /snap/core20/2717
loop1                     63.8M loop squashfs    /snap/core20/2769
loop2                     91.7M loop squashfs    /snap/lxd/38469
loop3                     91.7M loop squashfs    /snap/lxd/38800
loop5                     48.4M loop squashfs    /snap/snapd/26382
loop6                     49.3M loop squashfs    /snap/snapd/26865
sda                        200G disk
├─sda1                       1M part
├─sda2                       2G part ext4        /boot
├─sda3                      78G part LVM2_member
│ └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
└─sda4                     120G part LVM2_member
  └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
sr0                       1024M rom
```
===== NETWORK =====
```bash
lo               UNKNOWN        127.0.0.1/8 ::1/128
ens160           UP             172.23.0.49/24 fe80::250:56ff:fea7:2e3a/64
default via 172.23.0.126 dev ens160 proto static
172.23.0.0/24 dev ens160 proto kernel scope link src 172.23.0.49
```
===== K8S CHECK =====
```bash
net.ipv4.ip_forward = 0
```
# VM 5
===== BASIC =====
```bash
monitoring-web02
172.23.0.24
PRETTY_NAME="Ubuntu 22.04.4 LTS"
5.15.0-173-generic
up 4 weeks, 6 days, 4 hours, 37 minutes
```
===== CPU =====
```bash
8
CPU(s):                                  8
On-line CPU(s) list:                     0-7
Model name:                              Intel(R) Xeon(R) CPU E5-2697 v4 @ 2.30GHz
Thread(s) per core:                      1
Core(s) per socket:                      4
Socket(s):                               2
NUMA node0 CPU(s):                       0-7
```
===== RAM =====
```bash
               total        used        free      shared  buff/cache   available
Mem:           7.7Gi       408Mi       4.9Gi       1.0Mi       2.4Gi       7.0Gi
Swap:          3.8Gi          0B       3.8Gi
```
===== DISK =====
```bash
Filesystem                         Size  Used Avail Use% Mounted on
/dev/mapper/ubuntu--vg-ubuntu--lv   77G  8.3G   65G  12% /
NAME                       SIZE TYPE FSTYPE      MOUNTPOINT
loop0                     63.8M loop squashfs    /snap/core20/2717
loop1                     63.8M loop squashfs    /snap/core20/2769
loop2                     49.3M loop squashfs    /snap/snapd/26865
loop3                     91.7M loop squashfs    /snap/lxd/38469
loop4                     91.7M loop squashfs    /snap/lxd/38800
loop6                     48.4M loop squashfs    /snap/snapd/26382
sda                        200G disk
├─sda1                       1M part
├─sda2                       2G part ext4        /boot
├─sda3                      78G part LVM2_member
│ └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
└─sda4                     120G part LVM2_member
  └─ubuntu--vg-ubuntu--lv  198G lvm  ext4        /
sr0                       1024M rom
```
===== NETWORK =====
```bash
lo               UNKNOWN        127.0.0.1/8 ::1/128
ens160           UP             172.23.0.24/24 fe80::250:56ff:fea7:cd9b/64
default via 172.23.0.126 dev ens160 proto static
172.23.0.0/24 dev ens160 proto kernel scope link src 172.23.0.24
```
===== K8S CHECK =====
```bash
net.ipv4.ip_forward = 0
```
# VM 6
===== BASIC =====
```bash
sonarqube-web
172.23.0.28
PRETTY_NAME="Ubuntu 22.04.4 LTS"
5.15.0-176-generic
up 2 weeks, 5 days, 18 hours, 10 minutes
```
===== CPU =====
```bash
8
CPU(s):                                  8
On-line CPU(s) list:                     0-7
Model name:                              Intel(R) Xeon(R) CPU E5-2697 v4 @ 2.30GHz
Thread(s) per core:                      1
Core(s) per socket:                      8
Socket(s):                               1
NUMA node0 CPU(s):                       0-7
```
===== RAM =====
```bash
               total        used        free      shared  buff/cache   available
Mem:            15Gi       415Mi        12Gi       1.0Mi       2.3Gi        14Gi
Swap:          3.8Gi          0B       3.8Gi
```
===== DISK =====
```bash
Filesystem                         Size  Used Avail Use% Mounted on
/dev/mapper/ubuntu--vg-ubuntu--lv   77G  8.3G   65G  12% /
NAME                       SIZE TYPE FSTYPE      MOUNTPOINT
loop0                     63.8M loop squashfs    /snap/core20/2717
loop1                     63.8M loop squashfs    /snap/core20/2769
loop2                     91.7M loop squashfs    /snap/lxd/38469
loop3                     91.7M loop squashfs    /snap/lxd/38800
loop5                     48.4M loop squashfs    /snap/snapd/26382
loop6                     49.3M loop squashfs    /snap/snapd/26865
sda                        200G disk
├─sda1                       1M part
├─sda2                       2G part ext4        /boot
├─sda3                      78G part LVM2_member
│ └─ubuntu--vg-ubuntu--lv   98G lvm  ext4        /
└─sda4                      20G part LVM2_member
  └─ubuntu--vg-ubuntu--lv   98G lvm  ext4        /
sr0                       1024M rom
```
===== NETWORK =====
```bash
lo               UNKNOWN        127.0.0.1/8 ::1/128
ens160           UP             172.23.0.28/24 fe80::250:56ff:fea7:b69a/64
default via 172.23.0.126 dev ens160 proto static
172.23.0.0/24 dev ens160 proto kernel scope link src 172.23.0.28
```
===== K8S CHECK =====
```bash
net.ipv4.ip_forward = 0
```