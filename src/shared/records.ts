import { z } from 'zod';
export const SessionSchema = z.object({id:z.uuid(),startedAt:z.iso.datetime(),endedAt:z.iso.datetime().nullable(),energy:z.enum(['low','medium','high']).nullable(),status:z.enum(['active','completed','abandoned']),attemptIds:z.array(z.uuid()).max(100)}).strict();
export const DocumentSchema = z.object({id:z.uuid(),title:z.string().max(200),currentText:z.string().max(50000),revision:z.number().int().nonnegative(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),source:z.enum(['own','sample'])}).strict();
export const DocumentVersionSchema = z.object({id:z.uuid(),documentId:z.uuid(),text:z.string().max(50000),createdAt:z.iso.datetime(),reason:z.enum(['manual','pre_replace'])}).strict();
export const ReviewSchema = z.object({id:z.uuid(),sourceAttemptId:z.uuid(),offsetDays:z.number().int().min(1).max(365),dueLocalDate:z.iso.date(),timezone:z.string().refine(value=>{try{new Intl.DateTimeFormat('pl',{timeZone:value});return true;}catch{return false;}}),state:z.enum(['due','completed','skipped']),attemptId:z.uuid().nullable()}).strict();
export const ExposureSchema = z.object({id:z.uuid(),cardId:z.string().max(100),cardVersion:z.number().int().positive(),itemFamilyId:z.string().max(150),attemptId:z.uuid().nullable(),kind:z.enum(['preview','prompt','reserved']),shownAt:z.iso.datetime()}).strict();
export type Session = z.infer<typeof SessionSchema>;
export type DocumentRecord = z.infer<typeof DocumentSchema>;
export type DueReview = z.infer<typeof ReviewSchema>;
