'use server';

import * as faceService from '@/lib/services/face.service';

export async function getEmployeeFaceDescriptor(employeeId: string) {
  return faceService.getEmployeeFaceDescriptor(employeeId);
}
export async function saveEmployeeFaceDescriptor(
  employeeId: string,
  descriptor: number[]
) {
  return faceService.saveEmployeeFaceDescriptor(employeeId, descriptor);
}
