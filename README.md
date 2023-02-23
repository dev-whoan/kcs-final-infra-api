# Research Ansible
## How to run

```shell
~$ node research/ansible.js
Initializing...
VMALLNAMES:  []
Create list:  [ 'master1', 'worker1' ]
Creating static machines:  [ 'master1', 'worker1' ]
Creating Static VM:  master1
master1 00:50:52:11:25:03 00:50:52:f3:17:32
provisioning -> vm: starting..
provisioning -> vm: done
provisioning -> name: starting..
provisioning -> name: done
provisioning -> fip: starting..
provisioning -> fip: done
Creating Static VM:  worker1
worker1 00:50:52:83:ff:29 00:50:52:e3:ae:26
provisioning -> vm: starting..
provisioning -> vm: done
provisioning -> name: starting..
provisioning -> name: done
provisioning -> fip: starting..
provisioning -> fip: done
Succeed to create static machines
Read VM ALL Names:  [ 'master1', 'worker1' ]
Reading IPs ...
fip stdout: 192.168.0.241
192.168.0.255
fip stdout_lines: [ '192.168.0.241', '192.168.0.255' ]
fip stdout: 192.168.0.243
192.168.0.255
fip stdout_lines: [ '192.168.0.243', '192.168.0.255' ]
[
  Worker {
    name: 'master1',
    floatingIp: '192.168.0.241',
    privateIp: '192.168.122.43'
  },
  Worker {
    name: 'worker1',
    floatingIp: '192.168.0.243',
    privateIp: '192.168.122.95'
  }
]
Succeed to initialize!
Master1 is included in create List... resetting k8s cluster..
k8s initialize master info:  Worker {
  name: 'master1',
  floatingIp: '192.168.0.241',
  privateIp: '192.168.122.43'
}
Master1 initializing...
Resetting cluster [master1]...
Resetting cluster [master1] done
kubeadm init cluster [master1]...
kubeadm init cluster [master1] done
Setting Cluster(CNI, MetalLB) [master1]...
Setting Cluster(CNI, MetalLB) [master1] done
Worker[worker1] joining...
Resetting cluster [worker1]...
Resetting cluster [worker1] done
Joining cluster [worker1] -> [192.168.0.241]...
Joining cluster [worker1] -> [192.168.0.241] done
```
