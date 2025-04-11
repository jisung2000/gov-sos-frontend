// JWT 인증을 위한 Axios 인스턴스 및 인터셉터 설정 파일 jwtAxios는 인증 토큰 관리
import axios from "axios";
import { getCookie, setCookie, removeCookie } from "./cookieUtils";
// 기본 설정
const jwtAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,  // 환경변수에서 기본 API URL 설정
  withCredentials: true, // CORS 요청 시 쿠키 전송 허용
});

const REFRESH_TOKEN_ENDPOINT = "/api/reissue"; // 토큰 재발급 엔드포인트 정의
/** 요청 전 처리 */
const beforeReq = async (config) => {  // async 추가
  console.log("before request...");
  const memberInfo = getCookie("member");

  if (!memberInfo) {
    console.log("Member NOT FOUND");
    
    try {
      // 회원 정보가 없을 때 리프레시 토큰으로 갱신 시도
      const refreshResponse = await axios.post(
        REFRESH_TOKEN_ENDPOINT,
        {},
        { withCredentials: true }
      );
      console.log("Refresh Response:", refreshResponse.data);

      const { status, data } = refreshResponse.data;
      
      if (status === "success") {
        const { accessToken } = data;
        // 새로운 액세스 토큰 저장
        setCookie("member", JSON.stringify({ accessToken }), 7);
        
        // 현재 요청에 새 토큰 적용
        if (config.headers) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
      }
    } catch (error) {
      // 리프레시 토큰으로도 갱신 실패한 경우에만 로그인 페이지로 이동
      console.error("Refresh token failed:", error);
      window.location.href = "/login";
      return Promise.reject({
        response: {
          data: { error: "REQUIRE_LOGIN" }
        }
      });
    }
  }

  // 기존 멤버 정보가 있는 경우
  const parsedInfo = typeof memberInfo === 'string' ? 
    JSON.parse(memberInfo) : memberInfo;
  
  if (config.headers) {
    config.headers.Authorization = `Bearer ${parsedInfo.accessToken}`;
  }

  return config;
};
// 요청 실패 시 실행되는 함수
const requestFail = (err) => {
  console.log("request error..."); // 요청 실패 로그
  return Promise.reject(err); // 에러 그대로 반환
};

// 응답 실패 시 실행되는 인터셉터
const responseFail = async (error) => {
  // 원본 요청 정보 복사 및 재시도 플래그 설정
  const originalRequest = { ...error.config, _retry: error.config._retry || false };

  // 401 에러(인증 실패)이고 아직 재시도하지 않은 경우
  if (error.response?.status === 401 && !originalRequest._retry) {
    originalRequest._retry = true; // 재시도 플래그 설정

    try {
      // 토큰 재발급 요청
      const refreshResponse = await axios.post(
        REFRESH_TOKEN_ENDPOINT,
        {},
        { withCredentials: true }
      );

      const { status, data } = refreshResponse.data;  // 여기서 data 정의

      
       if (status === "success" && data?.accessToken) {
         // 새 액세스 토큰을 쿠키에 저장
         setCookie("member", JSON.stringify({ 
           accessToken: data.accessToken,
           userEmail: data.userEmail 
         }), 7);

      // 원본 요청의 헤더에 새 토큰 설정
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        }
        // 원본 요청 재시도
        return jwtAxios(originalRequest);
       }
    } catch (refreshError) {
      // 토큰 갱신 실패 시
      console.error("Token refresh failed. Logging out...", refreshError.message);
      removeCookie("member"); // 회원 정보 쿠키 삭제
      window.location.href = "/login"; // 로그인 페이지로 리다이렉트
    }
  }

  return Promise.reject(error); // 기타 에러는 그대로 반환
};

// 응답 성공 시 실행되는 인터셉터
const beforeRes = (res) => {
  console.log("before return response..."); // 응답 성공 로그
  return res; // 응답 그대로 반환
};

// 인터셉터 등록
jwtAxios.interceptors.request.use(beforeReq, requestFail); // 요청 인터셉터
jwtAxios.interceptors.response.use(beforeRes, responseFail); // 응답 인터셉터

export default jwtAxios;
