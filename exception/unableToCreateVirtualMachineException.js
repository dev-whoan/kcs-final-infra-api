class UnableToCreateVirtualMachineException extends Error {
  constructor(message) {
    super(message);
    this.name = "UnableToCreateVirtualMachineException";
  }
}

export default UnableToCreateVirtualMachineException;
