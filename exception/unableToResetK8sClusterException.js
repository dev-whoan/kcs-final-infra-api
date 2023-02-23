class UnableToResetK8sClusterException extends Error {
  constructor(message) {
    super(message);
    this.name = "UnableToResetK8sClusterException";
  }
}

export default UnableToResetK8sClusterException;
