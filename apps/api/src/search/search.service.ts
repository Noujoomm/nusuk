import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  titleAr?: string;
  subtitle?: string;
  trackName?: string;
  trackId?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async globalSearch(
    query: string,
    userId: string,
    role: string,
    params: { limit?: number; types?: string[] },
  ): Promise<SearchResponse> {
    const { limit = 20, types = ['track', 'employee', 'report', 'file', 'user'] } = params;
    const perType = Math.ceil(limit / types.length);

    // Determine accessible trackIds for non-admin/pm users
    const isPrivileged = role === 'admin' || role === 'pm';
    let allowedTrackIds: string[] | null = null;

    if (!isPrivileged) {
      const permissions = await this.prisma.trackPermission.findMany({
        where: { userId },
        select: { trackId: true },
      });
      allowedTrackIds = permissions.map((p) => p.trackId);
    }

    // Build search promises for each requested type
    const searches: Promise<SearchResult[]>[] = [];

    if (types.includes('track')) {
      searches.push(this.searchTracks(query, allowedTrackIds, perType));
    }
    if (types.includes('employee')) {
      searches.push(this.searchEmployees(query, allowedTrackIds, perType));
    }
    if (types.includes('report')) {
      searches.push(this.searchReports(query, allowedTrackIds, perType));
    }
    if (types.includes('file')) {
      searches.push(this.searchFiles(query, allowedTrackIds, perType));
    }
    if (types.includes('user') && isPrivileged) {
      searches.push(this.searchUsers(query, perType));
    }

    const searchResults = await Promise.all(searches);
    const results = searchResults.flat();

    return { results, total: results.length };
  }

  private async searchTracks(
    query: string,
    allowedTrackIds: string[] | null,
    limit: number,
  ): Promise<SearchResult[]> {
    const where: any = {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { nameAr: { contains: query } },
        { description: { contains: query, mode: 'insensitive' } },
        { descriptionAr: { contains: query } },
      ],
    };

    if (allowedTrackIds) {
      where.id = { in: allowedTrackIds };
    }

    const tracks = await this.prisma.track.findMany({
      where,
      take: limit,
      orderBy: { sortOrder: 'asc' },
    });

    return tracks.map((t) => ({
      type: 'track',
      id: t.id,
      title: t.name,
      titleAr: t.nameAr,
      subtitle: t.description ?? undefined,
    }));
  }

  private async searchEmployees(
    query: string,
    allowedTrackIds: string[] | null,
    limit: number,
  ): Promise<SearchResult[]> {
    const where: any = {
      OR: [
        { fullName: { contains: query, mode: 'insensitive' } },
        { fullNameAr: { contains: query } },
        { position: { contains: query, mode: 'insensitive' } },
        { positionAr: { contains: query } },
      ],
    };

    if (allowedTrackIds) {
      where.trackId = { in: allowedTrackIds };
    }

    const employees = await this.prisma.employee.findMany({
      where,
      include: {
        track: { select: { name: true, nameAr: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return employees.map((e) => ({
      type: 'employee',
      id: e.id,
      title: e.fullName,
      titleAr: e.fullNameAr,
      subtitle: e.position ?? e.positionAr ?? undefined,
      trackName: e.track?.nameAr ?? undefined,
      trackId: e.trackId ?? undefined,
    }));
  }

  private async searchReports(
    query: string,
    allowedTrackIds: string[] | null,
    limit: number,
  ): Promise<SearchResult[]> {
    const where: any = {
      title: { contains: query, mode: 'insensitive' },
    };

    if (allowedTrackIds) {
      where.trackId = { in: allowedTrackIds };
    }

    const reports = await this.prisma.report.findMany({
      where,
      include: {
        track: { select: { name: true, nameAr: true } },
        author: { select: { name: true, nameAr: true } },
      },
      take: limit,
      orderBy: { reportDate: 'desc' },
    });

    return reports.map((r) => ({
      type: 'report',
      id: r.id,
      title: r.title,
      subtitle: r.author.nameAr ?? r.author.name,
      trackName: r.track.nameAr,
      trackId: r.trackId,
    }));
  }

  private async searchFiles(
    query: string,
    allowedTrackIds: string[] | null,
    limit: number,
  ): Promise<SearchResult[]> {
    const where: any = {
      fileName: { contains: query, mode: 'insensitive' },
    };

    if (allowedTrackIds) {
      where.trackId = { in: allowedTrackIds };
    }

    const files = await this.prisma.uploadedFile.findMany({
      where,
      include: {
        track: { select: { name: true, nameAr: true } },
        uploadedBy: { select: { name: true, nameAr: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return files.map((f) => ({
      type: 'file',
      id: f.id,
      title: f.fileName,
      subtitle: f.uploadedBy.nameAr ?? f.uploadedBy.name,
      trackName: f.track?.nameAr ?? undefined,
      trackId: f.trackId ?? undefined,
    }));
  }

  private async searchUsers(query: string, limit: number): Promise<SearchResult[]> {
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { nameAr: { contains: query } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      type: 'user',
      id: u.id,
      title: u.name,
      titleAr: u.nameAr,
      subtitle: u.email,
    }));
  }
}
