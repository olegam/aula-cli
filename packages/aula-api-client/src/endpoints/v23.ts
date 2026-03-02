import type { HttpTransport } from "../http/transport";

export type AulaApiResponse<T> = {
  status: {
    code: number;
    message: string;
  };
  data: T;
  version?: number;
  module?: string;
  method?: string;
};

type RpcQueryValue = string | number | boolean | Array<string | number | boolean> | undefined;
type RpcQuery = Record<string, RpcQueryValue>;

type RpcRequestInput = {
  methodName: string;
  httpMethod?: "GET" | "POST";
  query?: RpcQuery;
  body?: unknown;
};

type NotificationsParams = {
  activeChildrenIds: number[];
  activeInstitutionCodes: string[];
};

type PostsParams = {
  institutionProfileIds: number[];
  index?: number;
  limit?: number;
  parent?: "profile" | "institution";
  isUnread?: boolean;
  isImportant?: boolean;
};

type ThreadsParams = {
  page?: number;
  sortOn?: "date";
  orderDirection?: "asc" | "desc";
};

type MessagesForThreadParams = {
  threadId: number;
  page?: number;
};

type ImportantDatesParams = {
  limit?: number;
  includeToday?: boolean;
};

type CalendarEventsParams = {
  instProfileIds: number[];
  start: string;
  end: string;
};

type PresenceDailyOverviewParams = {
  childIds: number[];
};

type PresenceStatesParams = {
  institutionProfileIds: number[];
};

type PresenceConfigurationParams = {
  childIds: number[];
};

type PresenceClosedDaysParams = {
  institutionCodes: string[];
};

type PresenceOpeningHoursParams = {
  institutionCodes: string[];
  startDate: string;
  endDate: string;
};

type AlbumsParams = {
  index?: number;
  limit?: number;
  sortOn?: "mediaCreatedAt" | "uploadedAt";
  orderDirection?: "asc" | "desc";
  filterBy?: "all" | "mine";
  filterInstProfileIds?: number[];
};

type MediaParams = {
  albumId: number;
  index?: number;
  limit?: number;
  sortOn?: "uploadedAt" | "mediaCreatedAt";
  orderDirection?: "asc" | "desc";
  filterBy?: "all" | "mine";
  filterInstProfileIds?: number[];
};

const createV23Query = (methodName: string, query?: RpcQuery): RpcQuery => {
  return {
    method: methodName,
    ...query
  };
};

export const createV23ReadClient = (transport: HttpTransport) => {
  const call = async <T>(input: RpcRequestInput): Promise<AulaApiResponse<T>> => {
    return transport.request<AulaApiResponse<T>>({
      method: input.httpMethod ?? "GET",
      path: "/api/v23/",
      query: createV23Query(input.methodName, input.query),
      body: input.body
    });
  };

  return {
    getProfilesByLogin: () => call<unknown>({ methodName: "profiles.getProfilesByLogin" }),
    getProfileContext: () => call<unknown>({ methodName: "profiles.getProfileContext" }),
    getNotificationsForActiveProfile: (params: NotificationsParams) =>
      call<unknown>({
        methodName: "notifications.getNotificationsForActiveProfile",
        query: {
          "activeChildrenIds[]": params.activeChildrenIds,
          "activeInstitutionCodes[]": params.activeInstitutionCodes
        }
      }),
    getPosts: (params: PostsParams) =>
      call<unknown>({
        methodName: "posts.getAllPosts",
        query: {
          parent: params.parent ?? "profile",
          index: params.index ?? 0,
          limit: params.limit ?? 10,
          isUnread: params.isUnread,
          isImportant: params.isImportant,
          "institutionProfileIds[]": params.institutionProfileIds
        }
      }),
    getThreads: (params: ThreadsParams = {}) =>
      call<unknown>({
        methodName: "messaging.getThreads",
        query: {
          sortOn: params.sortOn ?? "date",
          orderDirection: params.orderDirection ?? "desc",
          page: params.page ?? 0
        }
      }),
    getMessagesForThread: (params: MessagesForThreadParams) =>
      call<unknown>({
        methodName: "messaging.getMessagesForThread",
        query: {
          threadId: params.threadId,
          page: params.page ?? 0
        }
      }),
    getImportantDates: (params: ImportantDatesParams = {}) =>
      call<unknown>({
        methodName: "calendar.getImportantDates",
        query: {
          limit: params.limit ?? 11,
          include_today: params.includeToday ?? false
        }
      }),
    getCalendarEvents: (params: CalendarEventsParams) =>
      call<unknown>({
        methodName: "calendar.getEventsByProfileIdsAndResourceIds",
        httpMethod: "POST",
        body: {
          instProfileIds: params.instProfileIds,
          start: params.start,
          end: params.end
        }
      }),
    getPresenceDailyOverview: (params: PresenceDailyOverviewParams) =>
      call<unknown>({
        methodName: "presence.getDailyOverview",
        query: {
          "childIds[]": params.childIds
        }
      }),
    getPresenceStates: (params: PresenceStatesParams) =>
      call<unknown>({
        methodName: "presence.getPresenceStates",
        query: {
          "institutionProfileIds[]": params.institutionProfileIds
        }
      }),
    getPresenceConfigurationByChildIds: (params: PresenceConfigurationParams) =>
      call<unknown>({
        methodName: "presence.getPresenceConfigurationByChildIds",
        query: {
          "childIds[]": params.childIds
        }
      }),
    getPresenceClosedDays: (params: PresenceClosedDaysParams) =>
      call<unknown>({
        methodName: "presence.getClosedDays",
        query: {
          "institutionCodes[]": params.institutionCodes
        }
      }),
    getPresenceOpeningHoursByInstitutionCodes: (params: PresenceOpeningHoursParams) =>
      call<unknown>({
        methodName: "presence.getOpeningHoursByInstitutionCodes",
        query: {
          "institutionCodes[]": params.institutionCodes,
          startDate: params.startDate,
          endDate: params.endDate
        }
      }),
    getAlbums: (params: AlbumsParams = {}) =>
      call<unknown>({
        methodName: "gallery.getAlbums",
        query: {
          index: params.index ?? 0,
          limit: params.limit ?? 12,
          sortOn: params.sortOn ?? "mediaCreatedAt",
          orderDirection: params.orderDirection ?? "desc",
          filterBy: params.filterBy ?? "all",
          "filterInstProfileIds[]": params.filterInstProfileIds
        }
      }),
    getMedia: (params: MediaParams) =>
      call<unknown>({
        methodName: "gallery.getMedia",
        query: {
          albumId: params.albumId,
          index: params.index ?? 0,
          limit: params.limit ?? 12,
          sortOn: params.sortOn ?? "uploadedAt",
          orderDirection: params.orderDirection ?? "desc",
          filterBy: params.filterBy ?? "all",
          "filterInstProfileIds[]": params.filterInstProfileIds
        }
      })
  };
};
