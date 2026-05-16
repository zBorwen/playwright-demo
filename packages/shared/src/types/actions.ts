import { z } from 'zod';
import { 
  ServerMessageSchema, 
  AgentMessageSchema, 
  BrowserTypeSchema 
} from '../schema/protocol.js';

export type BrowserType = z.infer<typeof BrowserTypeSchema>;

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export type AgentMessage = z.infer<typeof AgentMessageSchema>;
