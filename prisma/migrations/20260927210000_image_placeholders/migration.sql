CREATE TABLE "ImagePlaceholder" (
  "url" TEXT NOT NULL,
  "blurHash" TEXT NOT NULL,
  "dataUrl" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImagePlaceholder_pkey" PRIMARY KEY ("url")
);
