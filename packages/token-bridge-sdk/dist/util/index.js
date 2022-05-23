import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { schema } from '@uniswap/token-lists';
export function assertNever(x, message = 'Unexpected object') {
    console.error(message, x);
    throw new Error('see console ' + message);
}
export const validateTokenList = (tokenList) => {
    const ajv = new Ajv();
    addFormats(ajv);
    const validate = ajv.compile(schema);
    return validate(tokenList);
};
