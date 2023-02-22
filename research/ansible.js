import Ansible from "node-ansible";
import path from "path";
import UnableToCreateVirtualMachineException from "../exception/unableToCreateVirtualMachineException.js";
import { objectKeysToArray } from "../common/util.js";
import fs from "fs";
import UnableToReadVirtualMachineException from "../exception/unableToReadVirtualMachineException.js";
/**
 * To Do List
 * Turn on Virtual Machines when it is defined but turned off
 */

class Worker {
  constructor(name, floatingIp, privateIp) {
    this.name = name;
    this.floatingIp = floatingIp;
    this.privateIp = privateIp;
  }
}

class AnsibleManager {
  static instance;
  constructor() {
    if (AnsibleManager.instance) return AnsibleManager.instance;

    //* ms
    this.VM_CREATED_AWAIT_TIME = 2000;

    this.FUNC_NAME = {
      readVms: "Get Defined VMs",
      readPrivateIP: "Get Private IP Address",
      readFloatingIP: "Get Floating IP",
    };
    this.workingWorkers = [];
    this.STATIC_MACS = {
      FLOATING: {
        master1: "00:50:52:11:25:03",
        master2: "00:50:52:a4:0f:11",
        worker1: "00:50:52:83:ff:29",
        worker2: "00:50:52:07:97:36",
        worker3: "00:50:52:07:29:31",
      },
      PRIVATE: {
        master1: "00:50:52:f3:17:32",
        master2: "00:50:52:47:ac:94",
        worker1: "00:50:52:e3:ae:26",
        worker2: "00:50:52:b7:a7:97",
        worker3: "00:50:52:33:f1:ee",
      },
    };

    this.staticVMs = ["master1"]//, "master2", "worker1", "worker2", "worker3"];
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

    console.log("Initializing...");
    this.#initialize();

    AnsibleManager.instance = this;
  }

  async #initialize() {
    let vmAllNames = [];
    try {
      vmAllNames = await this.readvms();
    } catch (err) {
      console.error(err.stack || err);
      throw new UnableToReadVirtualMachineException(`Fail to initialize Infra`);
    }

    let vmIpList = [];

    console.log("VMALLNAMES: ", vmAllNames);
    const createList = this.staticVMs.filter(
      (name) => !vmAllNames.includes(name)
    );
    console.log("Create list: ", createList);
    if (createList.length !== 0) {
      console.log("Creating static machines: ", createList);
      await this.createStaticMachines(createList);
      console.log("Succeed to create static machines");
    }

    try {
      vmAllNames = await this.readvms();
    } catch (err) {
      console.error(err.stack || err);
      throw new UnableToReadVirtualMachineException(
        `Fail to initialize Infra. Please restart the service.`
      );
    }

    console.log("Read VM ALL Names: ", vmAllNames);

    console.log("Reading IPs ... ");
    // IP 구하기
    for (let i = 0; i < vmAllNames.length; i++) {
      const item = vmAllNames[i];
      const privateIp = await this.getPrivateIP(item);
      const floatingIp = await this.getFloatingIP(item, privateIp);
      const nWorker = new Worker(item, floatingIp, privateIp);

      this.workingWorkers.push(nWorker);
    }

    console.log(this.workingWorkers);
    console.log("Succeed to initialize!");
  }

  createStaticMachines(createList) {
    return new Promise(async (resolve, reject) => {
      try {
        for (let i = 0; i < createList.length; i++) {
          const item = createList[i];
          console.debug("Creating Static VM: ", item);

          const inventoryPath = path.join(this.inventoryPath, `${item}.txt`);
          await this.scaleOut(item, inventoryPath);
          if (i === createList.length - 1) {
            return resolve(true);
          }
        }
      } catch (err) {
        console.error(err.stack || err);
        throw new UnableToCreateVirtualMachineException(
          `Fail to create static VMs - master1, master2, worker1, worker2, worker3`
        );
      }
    });
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
  getResultAsJson(output) {
    const lines = output.split("\n");
    while (lines[0] !== "{") {
      lines.splice(0, 1);
    }
    const newOutput = lines.join("\n");

    return JSON.parse(newOutput);
  }

  /**
   *
   * @param {string} GUEST_NAME explicitly select target host, and it will be its hostname
   * @returns
   */
  async renameAndRebootVM(GUEST_NAME) {
    return new Promise(async (resolve, reject) => {
      const yamlName = "set-vm-name";
      const yaml = path.join(this.yamlPath, yamlName);
      const inventoryPath = path.join(this.inventoryPath, `${GUEST_NAME}.txt`);
      const rebootCommand = this.createCommand(yaml, inventoryPath, {
        GUEST_NAME,
      });

      try {
        const result = await rebootCommand.exec();
        const jsonResult = this.getResultAsJson(result.output);
        return resolve(true);
      } catch (err) {
        return reject(err);
      }
    });
  }

  readvms() {
    return new Promise(async (resolve, reject) => {
      const yamlName = "read-vm";
      const yaml = path.join(this.yamlPath, yamlName);
      const readCommand = this.createCommand(yaml);

      let vmLists = [];

      try {
        const result = await readCommand.execAsync();
        const jsonResult = this.getResultAsJson(result.output);
        const tasks = jsonResult.plays[0].tasks;

        for (let i = 0; i < tasks.length; i++) {
          const item = tasks[i];
          if (item.task.name === this.FUNC_NAME.readVms) {
            vmLists = item.hosts.localhost.list_vms;
            break;
          }
        }

        return resolve(vmLists);
      } catch (err) {
        console.error("error while reading vms", err);
        return reject(err);
      }
    });
  }

  async getPrivateIP(GUEST_NAME) {
    const privYamlName = "read-private-ip";
    const privYaml = path.join(this.yamlPath, privYamlName);
    const privCommand = this.createCommand(privYaml, null, {
      GUEST_NAME,
    }); // GUEST_NAME: guestName
    //* Get Private IP
    try {
      const result = await privCommand.exec();
      const jsonResult = this.getResultAsJson(result.output);
      const tasks = jsonResult.plays[0].tasks;

      for (let i = 0; i < tasks.length; i++) {
        const item = tasks[i];
        if (item.task.name === this.FUNC_NAME.readPrivateIP) {
          return item.hosts.localhost.stdout;
          break;
        }
      }
    } catch (err) {
      return null;
    }
  }

  async getFloatingIP(GUEST_NAME, privateIp) {
    const privYamlName = "read-floating-ip";
    const privYaml = path.join(this.yamlPath, privYamlName);
    const privInventory = path.join(this.inventoryPath, `${GUEST_NAME}.txt`);
    const privCommand = this.createCommand(privYaml, privInventory, {
      GUEST_NAME,
    }); // GUEST_NAME: guestName
    //* Get Floating IP
    try {
      const result = await privCommand.exec();
      const jsonResult = this.getResultAsJson(result.output);
      const tasks = jsonResult.plays[0].tasks;

      for (let i = 0; i < tasks.length; i++) {
        const item = tasks[i];
        if (item.task.name === this.FUNC_NAME.readFloatingIP) {
          const hostName = `root@${privateIp}`;
          console.log("fip stdout:", item.hosts[hostName].stdout);
          console.log("fip stdout_lines:", item.hosts[hostName].stdout_lines);
          const ips = item.hosts[hostName].stdout_lines.filter(
            (item) => item !== "192.168.0.255"
          );
          return ips[0];
        }
      }
    } catch (err) {
      console.error("Error occured while getting floating ip", err.message);
      return null;
    }
  }

  async scaleOut(GUEST_NAME, INVENTORY_PATH) {
    return new Promise(async (resolve, reject) => {
      const yamlName = "provisioning";
      const yaml = path.join(this.yamlPath, yamlName);
      /* Provisioning */
      const FLOAT_MAC_ADDR = this.STATIC_MACS.FLOATING.GUEST_NAME
        ? this.STATIC_MACS.FLOATING.GUEST_NAME
        : this.generateMacAddr();

      const PRIV_MAC_ADDR = this.STATIC_MACS.PRIVATE.GUEST_NAME
        ? this.STATIC_MACS.PRIVATE.GUEST_NAME
        : this.generateMacAddr();

      const provisioningCommand = this.createCommand(yaml, null, {
        GUEST_NAME,
        INVENTORY_PATH,
        FLOAT_MAC_ADDR,
        PRIV_MAC_ADDR,
        // vm_ip: this.STATIC_PRIV_IPS[GUEST_NAME],
      });

      //* Provisioning
      try {
        console.log("provisioning -> vm: starting..");
        const provisioningResult = await provisioningCommand.execAsync();
        const jsonResult = this.getResultAsJson(provisioningResult.output);
        console.log("provisioning -> vm: done");
      } catch (err) {
        console.error("Error occured while provisioning -> vm", err);
        return reject(false);
      }

      //* set host name and reboot
      try {
        console.log("provisioning -> name: starting..");
        await this.renameAndRebootVM(GUEST_NAME);
        console.log("provisioning -> name: done");
      } catch (err) {
        console.error("Error occured while provisioning -> name", err);
        return reject(false);
      }

      //* Set VM Floating IP
      try {
        console.log("provisioning -> fip: starting..");
        const floatingYamlName = "set-floating-ip";
        const fYaml = path.join(this.yamlPath, floatingYamlName);
        const floatingCommand = this.createCommand(fYaml, INVENTORY_PATH, {
          GUEST_NAME,
        });

        const floatingResult = await floatingCommand.execAsync();
        const jsonResult = this.getResultAsJson(floatingResult.output);
        console.log("provisioning -> fip: done");
        setTimeout(() => {
          return resolve(true);
        }, this.VM_CREATED_AWAIT_TIME);
      } catch (err) {
        console.error("Error occured while provisioning -> fip", err.message);
        return reject(false);
      }
    });
  }

  /**
   * VM Worker Scale In Function. VM Workers will be removed fofi (first out, first in), based on its createdAt time.
   */
  scaleIn(GUEST_NAME) {
    /* Provisioning */
    const command = new Ansible.Playbook()
      .playbook("scale-in")
      .variables({ GUEST_NAME });

    command.exec();
  }

  /**
   *
   * @returns Randomly Generated Mac Address 16:16:16:16:16:16
   */
  generateMacAddr() {
    const mac = "00:50:52:XX:XX:XX";
    return mac.replace(/X/g, () => {
      return "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16));
    });
  }
}

/* Function */
async function test() {
  const ansibleManager = new AnsibleManager();
}

test();
