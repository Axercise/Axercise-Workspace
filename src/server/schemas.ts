import { z } from "zod";
export const taskSchema = z.object({
  title: z.string().trim().min(1, "กรุณาใส่ชื่องาน").max(300), details: z.string().max(20000).default(""),
  deadline: z.union([z.literal(""), z.iso.date(), z.iso.datetime({ offset: true })]).default(""),
  important: z.boolean().default(true), urgent: z.boolean().default(false), status: z.enum(["Todo", "Doing", "Done"]).default("Todo"),
  calendarEnabled: z.boolean().optional(),
}).refine(t => !t.calendarEnabled || !!t.deadline, "เลือกวันที่ของงานก่อนแสดงใน Calendar");
export const noteSchema = z.object({ title: z.string().trim().max(300).default(""), content: z.string().trim().min(1, "กรุณาใส่ไอเดีย").max(10000), tags: z.array(z.string().trim().min(1).max(60)).max(10).default([]) });
export const eventSchema = z.object({ title: z.string().trim().min(1, "กรุณาใส่ชื่อนัด").max(300), description: z.string().max(10000).default(""), start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }), location: z.string().max(300).default("") }).refine(v => Date.parse(v.end) > Date.parse(v.start), "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
export const idSchema = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_@.:-]+$/);
