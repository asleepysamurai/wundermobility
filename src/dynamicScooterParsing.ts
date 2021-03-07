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

type PacketFieldDefinition = {
  name: ((value: string) => string) | string;
  minFieldLength: number;
  maxFieldLength: number;
  valueFormatter?: (value: string, additionalValue?: string) => any;
  childCount?: (value: string) => number;
  children?: Array<PacketFieldDefinition>;
  includeInParsedInfo?: boolean;
};

// The max length of each field in each packet line
// Read this many characters from the line to get the value of the field
// Unless the read character is a ',', in which case truncate the value at that
const StartChar = '+';
const EndChar = '$';
const FieldDelimiter = ',';

const FixedLengthFieldDefinitions = [
  {
    name: 'type',
    minFieldLength: 2,
    maxFieldLength: 3,
  },
  {
    name: 'instruction',
    minFieldLength: 1,
    maxFieldLength: 20,
  },
  {
    name: 'imei',
    minFieldLength: 15,
    maxFieldLength: 15,
    valueFormatter: (value: string) => {
      // Not sure if IMEI cannot contain non-digits, examples make it seem like not so will attempt to parse to ensure its only string chars
      return `${validateAndParseBigInt(value)}`;
    },
    includeInParsedInfo: true,
  },
  {
    name: 'batteryLevel',
    minFieldLength: 1,
    maxFieldLength: 3,
    valueFormatter: (value: string) => {
      return `${validateAndParseInt(value)} %`;
    },
    includeInParsedInfo: true,
  },
  {
    name: 'odometer',
    minFieldLength: 1,
    maxFieldLength: 6,
    valueFormatter: (value: string) => {
      return `${validateAndParseInt(value)} km`;
    },
    includeInParsedInfo: true,
  },
  {
    name: 'time',
    minFieldLength: 19,
    maxFieldLength: 19,
    valueFormatter: (value: string) => {
      return validateAndParseDate(value);
    },
    includeInParsedInfo: true,
  },
  {
    name: 'countNumber',
    minFieldLength: 4,
    maxFieldLength: 4,
  },
]; // Will be used by both DeviceInfo and PositionUpdate - assuming they both have the same fields - if not customize this

const PacketFieldDefinitions: {
  [packetType: string]: Array<PacketFieldDefinition>;
} = {
  DeviceInfo: FixedLengthFieldDefinitions,
  PositionUpdate: FixedLengthFieldDefinitions,
  Error: [
    {
      name: 'type',
      minFieldLength: 2,
      maxFieldLength: 3,
    },
    {
      name: 'instruction',
      minFieldLength: 1,
      maxFieldLength: 5,
    },
    {
      name: 'imei',
      minFieldLength: 15,
      maxFieldLength: 15,
      valueFormatter: (value: string) => {
        // Not sure if IMEI cannot contain non-digits, examples make it seem like not so will attempt to parse to ensure its only string chars
        return `${validateAndParseInt(value)}`;
      },
      includeInParsedInfo: true,
    },
    {
      name: 'errorCount',
      minFieldLength: 1,
      maxFieldLength: 1,
      valueFormatter: (value: string) => {
        return validateAndParseInt(value);
      },
      children: [
        {
          name: 'errorCode',
          minFieldLength: 1,
          maxFieldLength: 2,
        },
        {
          name: (value: string) => {
            return value;
          },
          minFieldLength: 1,
          maxFieldLength: 20,
          valueFormatter: (name: string, value?: string) => {
            return value ? validateAndParseInt(value) : name;
          },
          includeInParsedInfo: true,
        },
      ],
    },
    {
      name: 'time',
      minFieldLength: 19,
      maxFieldLength: 19,
      valueFormatter: (value: string) => {
        return validateAndParseDate(value);
      },
      includeInParsedInfo: true,
    },
    {
      name: 'countNumber',
      minFieldLength: 4,
      maxFieldLength: 4,
    },
  ],
};

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

function isAllFieldsLengthInRange(
  fieldDefinitions: Array<PacketFieldDefinition>,
  fields: string[],
): boolean {
  return fields.every((field, i) => {
    const isMinFieldLengthValid = field.length >= fieldDefinitions[i].minFieldLength;
    const isMaxFieldLengthValid = field.length <= fieldDefinitions[i].maxFieldLength;
    return isMinFieldLengthValid && isMaxFieldLengthValid;
  });
}

function validateAndParseBigInt(value: string): BigInt {
  const num = BigInt(value);

  const isValid = `${num}` === value;
  if (!isValid) {
    throw new Error(`Not a valid number: ${value}`);
  }

  return num;
}

function validateAndParseInt(value: string): number {
  const num = parseInt(value);

  if (isNaN(num) || `${num}` !== value) {
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

function getDeviceInformationFromFields(
  fieldDefinitions: Array<PacketFieldDefinition>,
  parsedFields: any[],
): DeviceInformation {
  return fieldDefinitions.reduce(
    (deviceInfo: Partial<DeviceInformation>, fieldDefinition: PacketFieldDefinition, i: number) => {
      if (fieldDefinition.includeInParsedInfo) {
        // For dynamic fields, the value of a field tuple becomes either the fieldName or fieldValue in the parsed deviceInfo
        // So this is a bit of a hackish way to obtain the fieldName and fieldValue
        // We set includeInParsedInfo as false for the value field, and use the valueFormatter of the name field
        // to return the formatted value by passing both tuple values to the valueFormatter
        // This works so long as dynamic fields occur in pairs. If they don't this will break
        // Assuming that we dont need to optimize this to handle that case for now.
        const fieldName: keyof DeviceInformation = (typeof fieldDefinition.name === 'function'
          ? fieldDefinition.name(parsedFields[i])
          : fieldDefinition.name) as keyof DeviceInformation;
        const fieldValue =
          fieldDefinition.valueFormatter?.(parsedFields[i], parsedFields[i - 1]) || parsedFields[i];

        deviceInfo[fieldName] = fieldValue;
      }

      return deviceInfo;
    },
    {},
  ) as DeviceInformation;
}

function flattenFieldDefinitionsForPacket(
  fieldDefinitions: Array<PacketFieldDefinition>,
  fields: string[],
): Array<PacketFieldDefinition> {
  let flattenedFieldDefinitions: Array<PacketFieldDefinition> = [];

  fieldDefinitions.forEach((fieldDefinition) => {
    flattenedFieldDefinitions.push(fieldDefinition);

    if (fieldDefinition.children?.length) {
      let parsedCount = parseInt(fields[flattenedFieldDefinitions.length - 1]);
      if (isNaN(parsedCount)) {
        throw new Error('Invalid count');
      }

      while (parsedCount > 0) {
        flattenedFieldDefinitions = flattenedFieldDefinitions.concat(fieldDefinition.children);
        parsedCount -= 1;
      }
    }
  });

  return flattenedFieldDefinitions;
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

    const instruction = fields[1]; // This is hardcoded in this position for now. If in future other packets change the position we can specify that ar part of PacketFieldDefinitions maybe
    if (!PacketFieldDefinitions[instruction]) {
      // line does not have a recognized instruction
      // Consider whole line invalid
      continue;
    }

    try {
      const flattenedFieldDefinitions = flattenFieldDefinitionsForPacket(
        PacketFieldDefinitions[instruction],
        fields,
      );
      if (
        fields.length != flattenedFieldDefinitions.length ||
        !isAllFieldsLengthInRange(flattenedFieldDefinitions, fields)
      ) {
        // Incorrect number of fields in line
        // or Any field is invalid i.e. has wrong length
        // Consider whole line invalid
        continue;
      }

      deviceInformationList.push(getDeviceInformationFromFields(flattenedFieldDefinitions, fields));
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
  const payloadStream = await promisifiedReadFile('../data/deviceInfoError.packet', {
    encoding: 'utf8',
  });

  const deviceInfoList = getDeviceInformation(payloadStream);
  console.log(JSON.stringify(deviceInfoList));
}

if (require.main === module) {
  void init();
}
