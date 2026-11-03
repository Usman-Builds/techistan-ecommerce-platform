import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", () => ({ apiClient: { post } }));

import { requestReviewUploadSignature, saveReviewMedia } from "./media";

/**
 * #33: review photos use the customer endpoints. `/media` is the admin media
 * library and answers 403 to every customer.
 */
describe("review photo API", () => {
  beforeEach(() => post.mockReset().mockResolvedValue({}));

  it("asks the customer endpoint for an upload signature", async () => {
    await requestReviewUploadSignature();
    expect(post).toHaveBeenCalledWith("/reviews/media/upload-signature", {});
  });

  it("confirms the upload with the customer endpoint, sending only the reference", async () => {
    await saveReviewMedia({
      cloudinaryPublicId: "techistan/reviews/abc",
      url: "https://res.cloudinary.com/demo/image/upload/techistan/reviews/abc.jpg",
    });
    expect(post).toHaveBeenCalledWith("/reviews/media", {
      cloudinaryPublicId: "techistan/reviews/abc",
      url: "https://res.cloudinary.com/demo/image/upload/techistan/reviews/abc.jpg",
    });
    expect(post).not.toHaveBeenCalledWith("/media", expect.anything());
  });
});
