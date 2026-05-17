import { extractWellAddresses } from './src/compiler/precompile/ParameterGrammar.js';
console.log(JSON.stringify(extractWellAddresses('a 96-well plate on B2'), null, 2));
