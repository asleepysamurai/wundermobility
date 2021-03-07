import { getDeviceInformation } from '../src/dynamicScooterParsing';

/**
 * Test cases:
 * 1. Valid
 * 2. Bad Event Type
 * 3. bad field length < min
 * 4. bad field length > max
 * 5. bad field length = 0
 * 6. bad fields count < expected
 * 7. bad fields count > expected
 * 8. Field type mismatch imei
 * 9. Field type mismatch batteryLevel
 * 10. Field type mismatch odometer
 * 11. Field type mismatch date
 * 12. Total count of valid deviceInfoList items
 */

test('Extracts valid error and deviceInfo from string', () => {
  const string = `+IN,DeviceInfo,860861040012977,86,5600,2021-01-14T15:05:10,0035$
+IN,Error,860861040012977,4,5,NoBattery,7,ECUFailure,8,Reboot,10,IotError,2021-01-14T19:05:10,0039$
`;
  expect(getDeviceInformation(string)).toMatchSnapshot();
});

test('Ignores lines with event type not DeviceInfo, PacketUpdate or Error', () => {
  const string = `+IN,DeviceInfo,860861040012977,86,5600,2021-01-14T15:05:10,0035$
+IN,Error,860861040012977,4,5,NoBattery,7,ECUFailure,8,Reboot,10,IotError,2021-01-14T19:05:10,0039$
+IN,NotDeviceInfo,860861040012977,86,5600,2021-01-14T15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(2);
});

test('Ignores lines with any field length less than allowed minimum', () => {
  const string = `+IN,DeviceInfo,86,86,5600,2021-01-14T15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with any field length more than allowed minimum', () => {
  const string = `+IN,DeviceInfo,860861040012977,8600,5600,2021-01-14T15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with any field empty', () => {
  const string = `+IN,DeviceInfo,860861040012977,8600,,2021-01-14T15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with more fields than expected', () => {
  const string = `+IN,DeviceInfo,860861040012977,86,5600,86,5600,2021-01-14T15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with less fields than expected', () => {
  const string = `+IN,DeviceInfo,2021-01-14T15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with type mismatch on imei field', () => {
  const string = `+IN,DeviceInfo,8608610400129x7,86,5600,2021-01-14T15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with type mismatch on batteryLevel field', () => {
  const string = `+IN,DeviceInfo,860861040012977,x,5600,2021-01-14T15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with type mismatch on odometer field', () => {
  const string = `+IN,DeviceInfo,860861040012977,86,56x0,2021-01-14T15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with type mismatch on date field', () => {
  const string = `+IN,DeviceInfo,860861040012977,86,5600,2021-01-14x15:05:10,0035$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with count mismatch for dynamic fields count less than expected', () => {
  const string = `+IN,Error,860861040012977,4,5,NoBattery,2021-01-14T19:05:10,0039$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Ignores lines with count mismatch for dynamic fields count more than expected', () => {
  const string = `+IN,Error,860861040012977,1,5,NoBattery,5,ECUKaput,2021-01-14T19:05:10,0039$
`;
  expect(getDeviceInformation(string)).toHaveLength(0);
});

test('Count of valid deviceInfo/Error items extracted from string', () => {
  const string = `+IN,DeviceInfo,860861040012977,86,5600,2021-01-14T15:05:10,0035$
AABBAA
+IN,DeviceInfo,860861040012977,34,5612,2021-01-14T18:30:10,0036$
CCDDEE
+IN,DeviceInfo,860861040012977,3,5623,2021-01-14T23:59:10,0037$
FFGGHH
NEXT LINE IS NOT A DeviceInfo Packet
+IN,NotDeviceInfo,860861040012978,3,5623,2021-01-14T23:59:10,0038$
NEXT LINE HAS INVALID IMEI field length < minLength
+IN,DeviceInfo,8,3,5623,2021-01-14T23:59:10,0039$
NEXT LINE HAS INVALID Date field type
+IN,DeviceInfo,860861040012978,3,5623,2021-01-14xT23:59:10,0040$
NEXT LINE HAS INVALID battery percentage field length > maxLength
+IN,DeviceInfo,860861040012978,3000,5623,2021-01-14T23:59:10,0041$
NEXT LINE HAS less than required number of fields
+IN,DeviceInfo,860861040012978,0041$
NEXT LINE HAS more than required number of fields
+IN,DeviceInfo,860861040012978,3,5623,2021-01-14T23:59:10,0041,0042$
+IN,Error,860861040012977,2,5,NoBattery,7,ECUFailure,2021-01-14T15:06:18,0036$
+IN,Error,860861040012977,1,7,ECUFailure,2021-01-14T15:09:18,0037$
+IN,Error,860861040012977,4,5,NoBattery,7,ECUFailure,8,Reboot,10,IotError,2021-01-14T19:05:10,0039$
+IN,Error,860861040012977,0,2021-01-14T19:05:10,0039$
`;
  expect(getDeviceInformation(string)).toHaveLength(7);
});
