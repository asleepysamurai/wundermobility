import { readFile } from 'fs';
import { promisify } from 'util';

/*
 * The function accepts a STRING `payloadStream` as parameter.
 *
 *
 * The function is expected to RETURN an ARRAY in the following format:
 *
 *  [{ imei: STRING, batteryLevel: STRING, odometer: STRING, time: DATE },... ]
 *
 * Assumptions:
 *   1. Memory is not a constraint for handling the string,
 *   i.e. the payloadStream is a string that fits in memory
 *
 *   2. The various fields in the payloadStream are always delimited by a comma character
 *   i.e. after the expected length of that field is consumed, the next character will always be a ','
 *   If it is not a comma as expected we mark the line as invalid
 *
 *   3. All times in the payloadStream are specified in local time.
 *   The sample data does not have TZ info, and ISO8601 says this should be treated as local time
 *
 *   4. payloadStream string is ASCII encoded. No unicode here.
 *
 *   5. payloadStream is already ordered / ordering of input/output is not important \
 *   i.e. count number can be safely ignored
 */

type DeviceInformation = {
  imei: string;
  batteryLevel: string;
  odometer: string;
  time: Date;
};

// The max length of each field in each packet line
// Read this many characters from the line to get the value of the field
// Unless the read character is a ',', in which case truncate the value at that
const PacketMinFieldLengths = [2, 1, 15, 1, 1, 19, 4];
const PacketMaxFieldLengths = [3, 20, 15, 3, 6, 19, 4];
const StartChar = '+';
const EndChar = '$';
const FieldDelimiter = ',';

function getLine(payloadStream: string, cursor: number): [string, number] {
  let line: string = '';

  while (cursor < payloadStream.length && payloadStream[cursor] !== '\n') {
    line += payloadStream[cursor];
    ++cursor;
  }

  return [line, ++cursor]; // Increment cursor once more to get it to start of next line
}

function isStartAndEndCharValid(line: string): boolean {
  const isStartCharValid = line[0] === StartChar;
  const isEndCharValid = line[line.length - 1] === EndChar;
  return isStartCharValid && isEndCharValid;
}

function getFields(line: string): string[] {
  let fields: string[] = [];
  let cursor = 1;
  let field = '';

  while (cursor < line.length - 1) {
    if (line[cursor] === FieldDelimiter) {
      fields.push(field);
      field = '';
    } else {
      field += line[cursor];
    }
    ++cursor;
  }

  fields.push(field);
  return fields;
}

function isAllFieldsLengthInRange(fields: string[]): boolean {
  return fields.every((field, i) => {
    const isMinFieldLengthValid = field.length >= PacketMinFieldLengths[i];
    const isMaxFieldLengthValid = field.length <= PacketMaxFieldLengths[i];
    return isMinFieldLengthValid && isMaxFieldLengthValid;
  });
}

function validateAndParseNumber(value: string): BigInt {
  const num = BigInt(value);

  const isValid = `${num}` === value;
  if (!isValid) {
    throw new Error(`Not a valid number: ${value}`);
  }

  return num;
}

function validateAndParseDate(value: string): Date {
  const date = new Date(value);

  const isValid = date instanceof Date && !isNaN(date.getTime());
  if (!isValid) {
    throw new Error(`Not a valid date: ${value}`);
  }

  return date;
}

export const getDeviceInformation = function (payloadStream: string): Array<DeviceInformation> {
  let line: string;
  let cursor: number = 0;

  let deviceInformationList: Array<DeviceInformation> = [];

  while (payloadStream.length > cursor) {
    [line, cursor] = getLine(payloadStream, cursor);

    if (!isStartAndEndCharValid(line)) {
      // Invalid - skip line
      continue;
    }

    const fields = getFields(line);
    if (
      fields.length != PacketMaxFieldLengths.length ||
      !isAllFieldsLengthInRange(fields) ||
      fields[1] !== 'DeviceInfo'
    ) {
      // Incorrect number of fields in line
      // or Any field is invalid i.e. has wrong length
      // or line is not a DeviceInfo line
      // Consider whole line invalid
      continue;
    }

    try {
      deviceInformationList.push({
        imei: `${validateAndParseNumber(fields[2])}`, // Not sure if IMEI cannot contain non-digits, examples make it seem like not so will attempt to parse to ensure its only string chars
        batteryLevel: `${validateAndParseNumber(fields[3])} %`,
        odometer: `${validateAndParseNumber(fields[4])} km`,
        time: validateAndParseDate(fields[5]),
      });
    } catch (err) {
      // Field type conversion failed - probably due to invalid characters in string
      // Consider entire line invalid
      continue;
    }
  }

  return deviceInformationList;
};

async function init() {
  const promisifiedReadFile = promisify(readFile);
  const payloadStream = await promisifiedReadFile('../data/deviceInfo.packet', {
    encoding: 'utf8',
  });

  const deviceInfoList = getDeviceInformation(payloadStream);
  console.log(JSON.stringify(deviceInfoList));
}

if (require.main === module) {
  void init();
}
