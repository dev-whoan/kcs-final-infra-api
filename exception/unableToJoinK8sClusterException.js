class UnableToJoinK8sClusterException extends Error {
  constructor(message) {
    super(message);
    this.name = "UnableToJoinK8sClusterException";
  }
}

export default UnableToJoinK8sClusterException;
