class UnableToSetK8sMasterException extends Error {
  constructor(message) {
    super(message);
    this.name = "UnableToSetK8sMasterException";
  }
}

export default UnableToSetK8sMasterException;
