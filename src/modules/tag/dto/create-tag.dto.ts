import { IsOptional, IsString, MaxLength } from '@nestjs/class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateTagDto {
  @IsString()
  @MaxLength(12)
  @ApiProperty({ description: '标签名' })
  tagName: string

  @IsString()
  @IsOptional()
  @ApiProperty({ description: '标签图标类名', default: '' })
  icon?: string | null
}
