export const getUTCTime = () => {
  return new Date().toLocaleString("en-US", { timeZone: "UTC" });
};

export const arrayToObject = (array) => {
  const object = array.reduce((newObj, obj) => {
    newObj[obj] = true;
    return newObj;
  }, {});

  return object;
};

export const objectKeysToArray = (object) => {
  return Object.keys(object);
};

export const objectValuesToArray = (object) => {
  return Object.values(object);
};
