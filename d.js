import bcrypt from "bcrypt";

const inputPassword = "owner123";
const hash = "$2b$12$u93XCUJYcd9uh2gwj5ty5uYR5WwYnZWW3RFx4bHJNRMAWnAR244HW";

const match = await bcrypt.compare(inputPassword, hash);

console.log(match); // true or false
