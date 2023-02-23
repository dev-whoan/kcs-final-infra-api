class UnableToCreateK8sClusterException extends Error {
  constructor(message) {
    super(message);
    this.name = "UnableToCreateK8sClusterException";
  }
}

export default UnableToCreateK8sClusterException;
