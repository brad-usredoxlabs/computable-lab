const yaml = require('yaml');
const fs = require('fs');

const files = [
  'schema/studies/run-timeline.schema.yaml',
  'schema/workflow/event-graph.schema.yaml',
  'schema/workflow/protocol.schema.yaml'
];

files.forEach(f => {
  try {
    const doc = yaml.parse(fs.readFileSync(f, 'utf8'));
    console.log(f + ': OK');
  } catch(e) {
    console.log(f + ': ERROR - ' + e.message);
  }
});
