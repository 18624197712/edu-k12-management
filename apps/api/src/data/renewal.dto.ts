import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { EnrollmentType } from "@prisma/client";

export class EnrollmentActivityDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount = 0;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hours = 0;
}

export class EnrollmentQuoteDto {
  @IsEnum(EnrollmentType)
  type!: EnrollmentType;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  prospectName?: string;

  @IsOptional()
  @IsString()
  prospectPhone?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  normalHours = 0;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  halfHours = 0;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  giftHours = 0;

  @IsOptional()
  @IsString()
  giftType?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnrollmentActivityDto)
  activities: EnrollmentActivityDto[] = [];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  weeklyFrequency = 2;

  @Type(() => Number)
  @IsNumber()
  @Min(0.25)
  sessionHours = 2;

  @IsDateString()
  projectionStart!: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;
}

export class EnrollmentStudentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  grade!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  school?: string;
}

export class ConfirmEnrollmentDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnrollmentStudentDto)
  createStudent?: EnrollmentStudentDto;
}
