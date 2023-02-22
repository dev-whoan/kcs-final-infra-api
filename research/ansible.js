const Ansible = require('node-ansible');
const path = require('path');
/*
- name: Create and Start VM
  hosts: localhost
  become: true
  tasks:
    - name: Define VM
      command: >
                virt-install --import --name {{ GUEST_NAME }}
                --memory 2048 --vcpus 1 --noautoconsole
                --os-variant ubuntu22.04 --hvm --network bridge=br0
                --network network=default
                --disk=/vm-images/jammy01.img --import
    - name: Ensure VM is started
      virt:
        name: {{ GUEST_NAME }}
        state: running
      register: vm_start_results
      until: "vm_start_results is success"
      retries: 15
      delay: 2

- name: Add Host to Ansible Inventory
  hosts: localhost
  become: true
  tasks:
    - name: Get IP Address
      shell: virsh domifaddr {{ GUEST_NAME }} | grep -oE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b"
      register: defined_vm_ip_result

    - name: Set IP Address
      set_fact:
        vm_ip: "{{ item }}"
      with_items: "{{ defined_vm_ip_result.stdout }}"

      # If below part is not exist... Create new block...
    - name: Set Host
      blockinfile:
        path: /etc/ansible/hosts
        block: |
          [{{ GUEST_NAME }}]
          {{ vm_ip }}

- name: Set VM Public IP
  hosts: {{ GUEST_NAME }}
  become: true
  tasks:
    - name: Set Public IP
      lineinfile:
        path: /etc/netplan/50-cloud-init.yaml
        state: present
        insertafter: 'ethernets:'
        line: "    enp1s0:\n      dhcp4: true"
    - name: Netplan Apply
      command: sudo netplan apply
*/

class Worker {
  constructor() {
    this.name = null;
    this.ip = null;
    this.createdAt = null;
  }
}

class AnsibleManager {
  constructor() {
    this.scaledWorkerList = [];
    this.scaledCapacity = process.env.VM_SCALED_CAPACITY;
    this.yamlPath = path.join(process.env.PWD, 'playbooks');
  }

  scaleOut() {
    const scaledWorkerName = '';
    const yamlName = 'scale-out';
    const yaml = path.join(this.yamlPath, yamlName);
    /* Provisioning */
    const command = new Ansible.Playbook()
      .playbook('scale-out')
      .variables({ GUEST_NAME: 'jammy-ansible-...' })
      .askPass('test123');
  }

  /**
   * VM Worker Scale In Function. VM Workers will be removed fofi (first out, first in), based on its createdAt time.
   */
  scaleIn() {
    /* Provisioning */
    const command = new Ansible.Playbook()
      .playbook('scale-in')
      .variables({ GUEST_NAME: 'jammy-ansible-...' })
      .askPass('test123');

      command.exec();
  }
}

/* Function */
const yamlPath = path.join(process.env.PWD, 'playbooks', 'provisioning')
console.log("YamlPath", yamlPath);
const command = new Ansible.Playbook().playbook(yamlPath).variables({ GUEST_NAME: 'jammy-ansible-...' }).askPass('test123');

const result = command.exec();

result.then((success) => {
  console.log('succeed', success);
}, (err) => {
  console.log('Failed', err);
})