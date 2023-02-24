import Ansible from "node-ansible";
import path from "path";
import UnableToCreateVirtualMachineException from "../exception/unableToCreateVirtualMachineException.js";
import { objectKeysToArray } from "../common/util.js";
import fs from "fs";
import UnableToReadVirtualMachineException from "../exception/unableToReadVirtualMachineException.js";
import UnableToResetK8sClusterException from "../exception/unableToResetK8sClusterException.js";
import UnableToSetK8sMasterException from "../exception/unableToSetK8sMasterException.js";
import UnableToCreateK8sClusterException from "../exception/unableToCreateK8sClusterException.js";
import UnableToStartVirtualMachineException from "../exception/unableToStartVirtualMachineException.js";
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
    this.CAPACITY = {
      CPU: {
        master1: 3,
        master2: 3,
      },
      MEMORY: {
        master1: 4096,
        master2: 4096,
        worker1: 2048,
        worker2: 2048,
        worker3: 2048,
      },
    };
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

    //this.staticVMs = ["master1", "master2", "worker1", "worker2", "worker3"];
    this.staticVMs = ["master1", "worker1"];
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

    if (!!vmAllNames && vmAllNames.length !== 0) {
      for (let i = 0; i < vmAllNames.length; i++) {
        const item = vmAllNames[i];
        try {
          console.log("Start Defined VM: ", item);
          await this.ensureVMStarted(item);
        } catch (e) {
          throw new UnableToStartVirtualMachineException(
            `Fail to start defined VM on bootup [${item}]`
          );
        }
      }
    }

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

    //* sort result: master1, master2, worker1, worker2, ...
    this.workingWorkers.sort((a, b) => {
      return a.name > b.name ? 1 : b.name > a.name ? -1 : 0;
    });

    console.log(this.workingWorkers);
    console.log("Succeed to initialize!");

    //* Initialize Kubernetes
    if (createList.includes("master1")) {
      console.log(
        "Master1 is included in create List... resetting k8s cluster.."
      );
      try {
        await this.k8sInitialize();
      } catch (err) {
        throw err;
      }
    }
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

  ensureVMStarted(GUEST_NAME) {
    return new Promise(async (resolve, reject) => {
      const startYamlName = "start-vm";
      const startYaml = path.join(this.yamlPath, startYamlName);
      const startCommand = this.createCommand(startYaml, null, {
        GUEST_NAME,
      }); // GUEST_NAME: guestName

      try {
        const result = await startCommand.execAsync();
        const jsonResult = this.getResultAsJson(result.output);
        return resolve(true);
      } catch (err) {
        console.error(err.stack || err);
        throw new UnableToStartVirtualMachineException(
          `Fail to start Virtual Machine [${GUEST_NAME}]`
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
        const result = await rebootCommand.execAsync();
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
      const FLOAT_MAC_ADDR = this.STATIC_MACS.FLOATING[GUEST_NAME]
        ? this.STATIC_MACS.FLOATING[GUEST_NAME]
        : this.generateMacAddr();

      const PRIV_MAC_ADDR = this.STATIC_MACS.PRIVATE[GUEST_NAME]
        ? this.STATIC_MACS.PRIVATE[GUEST_NAME]
        : this.generateMacAddr();

      const V_CPUS = this.CAPACITY.CPU[GUEST_NAME]
        ? this.CAPACITY.CPU[GUEST_NAME]
        : 2;
      const V_MEMORY = this.CAPACITY.MEMORY[GUEST_NAME]
        ? this.CAPACITY.MEMORY[GUEST_NAME]
        : 2048;

      console.log(GUEST_NAME, FLOAT_MAC_ADDR, PRIV_MAC_ADDR);

      const provisioningCommand = this.createCommand(yaml, null, {
        GUEST_NAME,
        INVENTORY_PATH,
        FLOAT_MAC_ADDR,
        PRIV_MAC_ADDR,
        V_CPUS,
        V_MEMORY,
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
   * Initializing Kubeadm
   */
  async k8sInitialize() {
    return new Promise(async (resolve, reject) => {
      const master = this.workingWorkers.find(
        (element) => element.name === "master1"
      );
      console.log("k8s initialize master info: ", master);

      if (!master) {
        throw new UnableToCreateVirtualMachineException(
          `Fail to initialize K8s Cluster. Cannot find master1 information`
        );
      }

      //* initialize using floating ip
      let MASTER_IP = master.floatingIp;
      for (let i = 0; i < this.workingWorkers.length; i++) {
        const worker = this.workingWorkers[i];

        if (worker.name === "master1") {
          try {
            console.log("Master1 initializing...");
            await this.k8sMasterInit(worker.name, MASTER_IP);
          } catch (err) {
            throw err;
          }

          continue;
        }

        //* master for hpa. but not currently supported also will join to cluster as worker
        //   if (worker.name === "master2") {
        //     continue;
        //   }
        //* 4. kubeadm-join.yml
        try {
          console.log(`Worker[${worker.name}] joining...`);
          await this.k8sWorkerJoin(worker.name, MASTER_IP);
        } catch (err) {
          throw err;
        }
      }

      resolve(true);
    });
    // Expected output: 12
  }

  /**
   * Resetting Kubernetes According to Following Stpes
   * 1. kubeadm-reset.yml    -> GUEST_NAME
   * 2. kubeadm-init.yml     -> MASTER_IP
   * 3. kubeset-master.yml
   * @param {string} GUEST_NAME Guest name for initializing k8s node. basically, it must be master1
   * @param {string} MASTER_IP master ip. ex) 192.168.0.241
   */
  async k8sMasterInit(GUEST_NAME, MASTER_IP) {
    return new Promise(async (resolve, reject) => {
      const inventory = path.join(this.inventoryPath, `${GUEST_NAME}.txt`);
      const playDir = path.join(this.yamlPath, "k8s");
      const resetYaml = path.join(playDir, "kubeadm-reset");
      const initYaml = path.join(playDir, "kubeadm-init");
      const setMasterYaml = path.join(playDir, "kubeset-master");

      //* 1. kubeadm-reset.yml -> GUEST_NAME
      try {
        console.log(`Resetting cluster [${GUEST_NAME}]...`);
        const resetCommand = this.createCommand(resetYaml, inventory, {
          GUEST_NAME,
        });
        const resetResult = await resetCommand.execAsync();
        console.log(`Resetting cluster [${GUEST_NAME}] done`);
      } catch (err) {
        console.error(`Fail to reset k8s [${GUEST_NAME}]`, err);
        throw new UnableToResetK8sClusterException(
          `Fail to reset K8s Cluster -> ${GUEST_NAME}`
        );
      }

      //* 2. kubeadm-init.yml -> MASTER_IP
      try {
        console.log(`kubeadm init cluster [${GUEST_NAME}]...`);
        const initCommand = this.createCommand(initYaml, inventory, {
          MASTER_IP,
        });
        const initResult = await initCommand.execAsync();
        console.log(`kubeadm init cluster [${GUEST_NAME}] done`);
      } catch (err) {
        console.error(`Fail to reset k8s [${GUEST_NAME}]`, err);
        throw new UnableToCreateK8sClusterException(
          `Fail to create(kubeadm init) K8s Cluster -> ${GUEST_NAME}`
        );
      }

      //* 3. kubeset-master.yml
      try {
        console.log(`Setting Cluster(CNI, MetalLB) [${GUEST_NAME}]...`);
        const setMasterCommand = this.createCommand(
          setMasterYaml,
          inventory,
          null
        );
        const setMasterResult = await setMasterCommand.execAsync();
        console.log(`Setting Cluster(CNI, MetalLB) [${GUEST_NAME}] done`);
      } catch (err) {
        console.error(`Fail to reset k8s [${GUEST_NAME}]`, err);
        throw new UnableToSetK8sMasterException(
          `Fail to set Master Node in K8s Cluster -> ${GUEST_NAME}`
        );
      }

      return resolve(true);
    });
  }

  /**
   * 1. kubeadm-reset.yml
   * 2. kubeadm-join.yml
   * @param {string} GUEST_NAME Guest name for initializing k8s node. basically, it must be master1
   * @param {string} MASTER_IP master ip. ex) 192.168.0.241
   */
  async k8sWorkerJoin(GUEST_NAME, MASTER_IP) {
    //* 1. kubeadm-join.yml     -> GUEST_NAME, MASTER_IP
    const inventory = path.join(this.inventoryPath, `${GUEST_NAME}.txt`);
    const playDir = path.join(this.yamlPath, "k8s");
    const resetYaml = path.join(playDir, "kubeadm-reset");
    const initYaml = path.join(playDir, "kubeadm-join");

    //* 1. kubeadm-reset.yml -> GUEST_NAME
    try {
      console.log(`Resetting cluster [${GUEST_NAME}]...`);
      const resetCommand = this.createCommand(resetYaml, inventory, {
        GUEST_NAME,
      });
      const resetResult = await resetCommand.execAsync();
      console.log(`Resetting cluster [${GUEST_NAME}] done`);
    } catch (err) {
      console.error(`Fail to reset k8s [${GUEST_NAME}]`, err);
      throw new UnableToResetK8sClusterException(
        `Fail to reset K8s Cluster -> ${GUEST_NAME}`
      );
    }

    //* 2. kubeadm-join.yml -> GUEST_NAME, MASTER_IP
    try {
      console.log(`Joining cluster [${GUEST_NAME}] -> [${MASTER_IP}]...`);
      const joinCommand = this.createCommand(initYaml, inventory, {
        GUEST_NAME,
        MASTER_IP,
      });
      const joinResult = await joinCommand.execAsync();
      console.log(`Joining cluster [${GUEST_NAME}] -> [${MASTER_IP}] done`);
    } catch (err) {
      console.error(`Fail to reset k8s [${GUEST_NAME}]`, err);
      throw new UnableToResetK8sClusterException(
        `Fail to reset K8s Cluster -> ${GUEST_NAME}`
      );
    }
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
