## Forked for WunderMobility Take Home Coding Challenge

Gutted all of the db, server, and API related code, since this challenge just requires a couple of scripts.

## Running instructions

    yarn install

    # for assignment part 1
    yarn start:sp

    # for assignment part 2
    yarn start:dsp

    # for tests
    yarn test

### Assumptions

- Memory is not a constraint for handling the string,
  i.e. the payloadStream is a string that fits in memory

- The various fields in the payloadStream are always delimited by a comma character
  i.e. after the expected length of that field is consumed, the next character will always be a ','
  If it is not a comma as expected we mark the line as invalid

- All times in the payloadStream are specified in local time.
  The sample data does not have TZ info, and ISO8601 says this should be treated as local time

- payloadStream string is ASCII encoded. No unicode here.

- payloadStream is already ordered / ordering of input/output is not important \
  i.e. count number can be safely ignored

### Things I should probably have done but didn't because of an unexpectedly busy weekend

- range check during validation for fields with known ranges (ex: sequence numbers, odo reading, battery level, error count)
- handle error count = 0 case. Currently it's treated as valid if errorCount is 0 and there are not error tuples. Not sure if this should have been an error case
- Perhaps log errors while parsing instead of silently skipping to next line - not sure if printing out a long list of errors while parsing was going to be helpful

I've also not just directly refactored the part1 of the assignment, and instead copied the file over for part2 and refactored there. This was done to aid comparisons between the two versions without having to switch branches. As such they use a lot of duplicated functions that could have been extracted out and shared.

I've also opted to go for the approach of parsing lines and fields seperately instead of just iterating throught the payload string once and extracting as I go. I thought my approach of extracting line by line and then field by field was more readable, and considering the maximum possible size of a line, it seemed like a reasonable performance tradeoff.
