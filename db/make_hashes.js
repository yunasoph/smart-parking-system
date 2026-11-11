// make_hashes.js: Generate bcrypt password hashes for seeding app_user
// Usage: node db/make_hashes.js <password1> [password2 ...]

const path = require('node:path');
const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node db/make_hashes.js <password1> [password2 ...]');
  process.exit(1);
}

for (const pwd of args) {
  const hash = bcrypt.hashSync(pwd, 10);
  console.log(hash);
}
