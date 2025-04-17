# Ordered Diff Review

## 1. src/lib/interfaces.ts

```diff
@@ -0,0 +1,9 @@
++// Define core interfaces
++export interface User {
++  id: string;
++  name: string;
++  email: string;
++}
++
++export interface UserRepository {
++  findById(id: string): Promise<User | null>;
```

## 2. src/lib/userRepository.ts

```diff
@@ -0,0 +1,12 @@
++import { User, UserRepository } from './interfaces';
++import { db } from './database';
++
++export class UserRepositoryImpl implements UserRepository {
++  async findById(id: string): Promise<User | null> {
++    try {
++      const user = await db.users.findOne({ id });
++      return user;
++    } catch (error) {
++      console.error('Error finding user:', error);
++      return null;
++    }
```

## 3. src/services/userService.ts

```diff
@@ -1,8 +1,8 @@
--// User service implementation
--export class UserService {
--  async getUser(id: string) {
--    // Old implementation
--    const user = { id, name: 'Default' };
--    return user;
++import { User, UserRepository } from '../lib/interfaces';
++
++export class UserService {
++  constructor(private userRepository: UserRepository) {}
++  
++  async getUser(id: string): Promise<User | null> {
++    return this.userRepository.findById(id);
    }
  }
```

