import Ansible from "node-ansible";
import path from "path";
import { objectKeysToArray } from "../common/util.js";
import fs from 'fs';

class Worker {
  constructor(name, floatingIp, privateIp) {
    this.name = null;
    this.floatingIp = null;
    this.privateIp = null;
  }
}

class AnsibleManager {
  static instance;
  constructor() {
    console.log("hey am");
    if (AnsibleManager.instance) return AnsibleManager.instance;

    this.FUNC_NAME = {
        readVms: 'Get Defined VMs',
        readPrivateIP: 'Get Private IP Address',
        readFloatingIP: 'Get Floating IP'
    }
    this.workingWorkers = [];
    this.staticVMs = ["master1", "master2", "worker1", "worker2", "worker3"];
    this.scaleWorkerPrefix = "dworker";
    this.scaledCapacity = process.env.VM_SCALED_CAPACITY
      ? process.env.VM_SCALED_CAPACITY
      : 2;
    this.yamlPath = path.join(process.env.PWD, "ansible-config", "playbooks");
    this.inventoryPath = path.join(
      process.env.PWD,
      "ansible-config",
      "inventory"
    );

    this.#initialize();

    AnsibleManager.instance = this;
  }

  async #initialize() {
    const vmAllNames = await this.readvms();
    let vmIpList = [];

    if(!vmAllNames){
        await this.createStaticMachines();
    }

    console.log('여기?', vmAllNames);
    for(let i = 0; i < vmAllNames.length; i++){
        console.log('여기는?')
        const item = vmAllNames[i];
        const privateIp = await this.getPrivateIP(item);
        const floatingIp = await this.getFloatingIP(item, privateIp);

        console.log(privateIp, floatingIp)
    }
  }

  createStaticMachines(){

  }

  /**
   *
   * @param {string} yaml yaml file path
   * @param {string} inventory inventory file path
   * @param {object} val variable to pass into playbook
   * @returns
   */
  createCommand(yaml, inventory, val) {
    const command = new Ansible.Playbook().playbook(yaml);

    if (val) {
      command.variables(val);
    }

    if (inventory) {
      command.inventory(inventory);
    }

    return command;
  }

  /**
   * 
   * @param {Object} output result.output of ansible command
   */
  getResultAsJson(output){
    const lines = output.split('\n');
    while(lines[0] !== '{'){
        lines.splice(0, 1);
    }
    const newOutput = lines.join('\n');

    return JSON.parse(newOutput);
  }

  async readvms() {
    const yamlName = "read-vm";
    const yaml = path.join(this.yamlPath, yamlName);
    const readCommand = this.createCommand(yaml);

    let vmLists = [];

    try {
      const result = await readCommand.exec();
      const jsonResult = this.getResultAsJson(result.output);
      const tasks = jsonResult.plays[0].tasks;

      for(let i = 0; i < tasks.length; i++){
        const item = tasks[i];
        if(item.task.name === this.FUNC_NAME.readVms){
            vmLists = item.hosts.localhost.list_vms;
            break;
        }
      }
      
      return vmLists;
    } catch (err) {
      console.log("error while reading vms", err);
      return null;
    }
  }

  async getPrivateIP(guestName){
    const privYamlName = 'read-private-ip';
    const privYaml = path.join(this.yamlPath, privYamlName);
    const privCommand = this.createCommand(privYaml, null, { GUEST_NAME: 'jammy-ansible' });        // GUEST_NAME: guestName
    //* Get Private IP
    try{
        const result = await privCommand.exec();
        const jsonResult = this.getResultAsJson(result.output);
        const tasks = jsonResult.plays[0].tasks;

        for(let i = 0; i < tasks.length; i++){
            const item = tasks[i];
            if(item.task.name === this.FUNC_NAME.readPrivateIP){
                return item.hosts.localhost.stdout;
                break;
            }
        }
    } catch (err) { return null; }
  }

  async getFloatingIP(guestName, privateIp) {
    const privYamlName = 'read-floating-ip';
    const privYaml = path.join(this.yamlPath, privYamlName);
    const privInventory = path.join(this.inventoryPath, 'jammy-ansible.txt');
    const privCommand = this.createCommand(privYaml, privInventory, { GUEST_NAME: 'jammy-ansible' });   // GUEST_NAME: guestName
    //* Get Floating IP
    try{
        const result = await privCommand.exec();
        const jsonResult = this.getResultAsJson(result.output);
        const tasks = jsonResult.plays[0].tasks;

        for(let i = 0; i < tasks.length; i++){
            const item = tasks[i];
            if(item.task.name === this.FUNC_NAME.readFloatingIP){
                const hostName = `root@${privateIp}`;
                const ips = item.hosts[hostName].stdout_lines.filter( (item) => item !== '192.168.0.255');
                return ips[0];
            }
        }
    } catch (err) { console.log("Error occured while getting floating ip", err); return null; }
  }

  async scaleOut() {
    const scaledWorkerName = "";
    const yamlName = "provisioning";
    const yaml = path.join(this.yamlPath, yamlName);
    /* Provisioning */
    const provisioningCommand = new Ansible.Playbook()
      .playbook(yamlPath)
      .variables({ GUEST_NAME: "jammy-ansible" })
      .user("root")
      .vaultPasswordFile(vault)
      .verbose("v")
      .inventory("/etc/ansible/hosts");

    try {
      const provisioningResult = await provisioningCommand();
    } catch (err) {}
  }

  /**
   * VM Worker Scale In Function. VM Workers will be removed fofi (first out, first in), based on its createdAt time.
   */
  scaleIn() {
    /* Provisioning */
    const command = new Ansible.Playbook()
      .playbook("scale-in")
      .variables({ GUEST_NAME: "jammy-ansible-..." })
      .askPass("test123");

    command.exec();
  }
}

/* Function */

console.log("Hello");
async function test() {
  const ansibleManager = new AnsibleManager();
}

test();

console.log("Bye");

/*
result.then(
  (success) => {
    console.log("succeed", success);
    console.log("Setting Public IP...");

  
    const ipPath = path.join(process.env.PWD, "playbooks", "setPublicIP");
    const ipCommand = new Ansible.Playbook()
      .playbook(ipPath)
      .variables({ GUEST_NAME: "jammy-ansible" })
      .user("root")
      .vaultPasswordFile(vault)
      .verbose("v")
      .inventory("/etc/ansible/hosts");

    const ipResult = ipCommand.exec();
    ipResult.then(
      (success) => console.log(success),
      (err) => console.error(err)
    );
  
  },
  (err) => {
    console.log("Failed", err);
  }
);
*/
