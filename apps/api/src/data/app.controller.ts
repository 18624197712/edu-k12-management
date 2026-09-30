import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { AuthRequest } from "../auth/auth.guard";
import { Public } from "../auth/auth.guard";
import { DataService } from "./data.service";
import { ConfirmEnrollmentDto, EnrollmentQuoteDto } from "./renewal.dto";
import type { Response } from "express";

@ApiTags("业务数据")
@Controller()
export class AppController {
  constructor(private data: DataService) {}

  @Public() @Get("health") health() {
    return { data: { status: "ok", time: new Date().toISOString() } };
  }
  @Get("dashboard/summary") async dashboard(@Req() req: AuthRequest) {
    return { data: await this.data.dashboard(req.user) };
  }
  @Get("todos") async todos(
    @Query() query: Record<string, string>,
    @Req() req: AuthRequest,
  ) {
    return this.data.todos(query, req.user);
  }
  @Post("todos") async createTodo(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveTodo(body, req.user) };
  }
  @Patch("todos/:id") async updateTodo(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveTodo(body, req.user, id) };
  }
  @Patch("todos/:id/completed") async completeTodo(
    @Param("id") id: string,
    @Body("completed") completed: boolean,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.setTodoCompleted(id, completed, req.user) };
  }
  @Delete("todos/:id") async deleteTodo(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteTodo(id, req.user);
    return { data: { success: true } };
  }
  @Get("courses/options") async courses() {
    return { data: await this.data.courses() };
  }

  @Get("students") async students(
    @Query() query: Record<string, string>,
    @Req() req: AuthRequest,
  ) {
    return this.data.students(query, req.user);
  }
  @Get("students/:id") async student(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.student(id, req.user) };
  }
  @Post("students") async createStudent(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.createStudent(body, req.user) };
  }
  @Patch("students/:id") async updateStudent(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.updateStudent(id, body, req.user) };
  }
  @Delete("students/:id") async deleteStudent(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteStudent(id, req.user);
    return { data: { success: true } };
  }
  @Get("students/:id/archive") async archive(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.student(id, req.user) };
  }
  @Patch("students/:id/archive") async updateArchive(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.updateArchive(id, body, req.user) };
  }
  @Get("students/:id/hour-ledgers") async hourLedgers(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.hourLedgers(id, req.user) };
  }

  @Get("plans") async plans(@Query("studentId") studentId?: string) {
    return { data: await this.data.plans(studentId) };
  }
  @Post("plans") async savePlan(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.savePlan(body, req.user) };
  }
  @Delete("plans/:id") async deletePlan(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deletePlan(id, req.user);
    return { data: { success: true } };
  }
  @Get("score-batches") async scoreBatches(
    @Query("studentId") studentId: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.scoreBatches(studentId, req.user) };
  }
  @Post("score-batches") async saveScoreBatch(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveScoreBatch(body, req.user) };
  }
  @Delete("score-batches/:id") async deleteScoreBatch(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteScoreBatch(id, req.user);
    return { data: { success: true } };
  }
  @Get("scores") async scores(
    @Query("studentId") studentId?: string,
    @Query("batchId") batchId?: string,
  ) {
    return { data: await this.data.scores(studentId, batchId) };
  }
  @Post("scores") async saveScore(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveScore(body, req.user) };
  }
  @Delete("scores/:id") async deleteScore(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteScore(id, req.user);
    return { data: { success: true } };
  }
  @Get("lessons") async lessons(
    @Query() query: Record<string, string>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.lessons(query, req.user) };
  }
  @Post("lessons") async createLesson(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.createLesson(body, req.user) };
  }
  @Patch("lessons/:id") async updateLesson(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.updateLesson(id, body, req.user) };
  }
  @Delete("lessons/:id") async deleteLesson(
    @Param("id") id: string,
    @Query("scope") scope: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteLesson(id, scope, req.user);
    return { data: { success: true } };
  }
  @Get("learning-reports") async reports(
    @Query("studentId") studentId?: string,
  ) {
    return { data: await this.data.reports(studentId) };
  }
  @Post("learning-reports/generate") async generateReport(
    @Body() body: Record<string, unknown>,
  ) {
    return { data: await this.data.generateReport(body) };
  }
  @Delete("learning-reports/:id") async deleteReport(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteLearningReport(id, req.user);
    return { data: { success: true } };
  }

  @Get("parent-meetings") async meetings(
    @Query("studentId") studentId?: string,
  ) {
    return { data: await this.data.meetings(studentId) };
  }
  @Post("parent-meetings") async saveMeeting(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveMeeting(body, req.user) };
  }
  @Patch("parent-meetings/:id") async updateMeeting(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveMeeting(body, req.user, id) };
  }
  @Delete("parent-meetings/:id") async deleteMeeting(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteMeeting(id, req.user);
    return { data: { success: true } };
  }

  @Get("renewals") async renewals(
    @Query() query: Record<string, string>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.renewals(query, req.user) };
  }
  @Post("renewals/calculate") async calculateRenewal(
    @Body() body: EnrollmentQuoteDto,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.calculateRenewalForUser(body, req.user) };
  }
  @Post("renewals") async saveRenewal(
    @Body() body: EnrollmentQuoteDto,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveRenewal(body, req.user) };
  }
  @Patch("renewals/:id") async updateRenewal(
    @Param("id") id: string,
    @Body() body: EnrollmentQuoteDto,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.updateRenewal(id, body, req.user) };
  }
  @Post("renewals/:id/confirm") async confirmRenewal(
    @Param("id") id: string,
    @Body() body: ConfirmEnrollmentDto,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.confirmRenewal(id, body, req.user) };
  }
  @Post("renewals/:id/cancel") async cancelRenewal(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.cancelRenewal(id, req.user) };
  }
  @Delete("renewals/:id") async deleteRenewal(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteRenewal(id, req.user);
    return { data: { success: true } };
  }
  @Get("business-applications") async business(@Query("type") type?: string) {
    return { data: await this.data.business(type) };
  }
  @Post("business-applications") async saveBusiness(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveBusiness(body, req.user) };
  }
  @Delete("business-applications/:id") async deleteBusiness(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteBusiness(id, req.user);
    return { data: { success: true } };
  }

  @Get("recommendations") async recommendations(
    @Query("month") month?: string,
  ) {
    return { data: await this.data.recommendations(month) };
  }
  @Post("recommendations") async saveRecommendation(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveRecommendation(body, req.user) };
  }
  @Patch("recommendations/:id") async updateRecommendation(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveRecommendation(body, req.user, id) };
  }
  @Delete("recommendations/:id") async deleteRecommendation(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteRecommendation(id, req.user);
    return { data: { success: true } };
  }

  @Get("training/modules") async trainingModules() {
    return { data: await this.data.trainingModules() };
  }
  @Post("training/modules") async saveTrainingModule(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveTrainingModule(body, req.user) };
  }
  @Patch("training/modules/:id") async updateTrainingModule(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.saveTrainingModule(body, req.user, id) };
  }
  @Delete("training/modules/:id") async deleteTrainingModule(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteTrainingModule(id, req.user);
    return { data: { success: true } };
  }
  @Post("files/upload-url") async uploadUrl(
    @Body() body: { name: string; type: string },
  ) {
    return { data: await this.data.uploadUrl(body.name, body.type) };
  }
  @Post("files/complete") async completeUpload(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.completeUpload(body, req.user) };
  }
  @Get("files/download-url") async downloadUrl(@Query("key") key: string) {
    return { data: await this.data.downloadUrl(key) };
  }
  @Delete("files/:id") async deleteMaterial(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    await this.data.deleteMaterial(id, req.user);
    return { data: { success: true } };
  }

  @Get("reports/analytics") async analytics() {
    return { data: await this.data.analytics() };
  }
  @Get("profile") async profile(@Req() req: AuthRequest) {
    return { data: await this.data.profile(req.user) };
  }
  @Patch("profile") async updateProfile(
    @Body() body: Record<string, unknown>,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.updateProfile(body, req.user) };
  }
  @Post("imports/students")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  async importStudents(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.importStudents(file?.buffer, req.user) };
  }
  @Get("imports/:kind/template") async importTemplate(
    @Param("kind") kind: string,
    @Res() res: Response,
  ) {
    const buffer = await this.data.importTemplate(kind);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${kind}-template.xlsx`,
    );
    res.send(buffer);
  }
  @Post("imports/:kind")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  async importLedger(
    @Param("kind") kind: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.data.importLedger(kind, file?.buffer, req.user) };
  }
}
