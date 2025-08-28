import { School, User } from "@prisma/client";
import express from "express";


declare global {
  namespace Express {
    interface Request {
      user: Omit<User, "hashedPassword", "provider">;
      school: School;
    }
  }
}
