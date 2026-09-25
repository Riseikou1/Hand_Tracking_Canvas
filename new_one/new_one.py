import cv2
import time
import os
import sys

# Ensure we can import HandTrackingModule
sys.path.append('/home/goku/Desktop/projects/Hand_Tracking_Canvas/new_one')  
import HandTrackingModule as htm

wCam, hCam = 640, 480
cap = cv2.VideoCapture(0)
cap.set(3, wCam)
cap.set(4, hCam)

# Load finger images
folderPath = "/home/goku/Desktop/projects/Hand_Tracking_Canvas/new_one/FingerImages"
myList = os.listdir(folderPath)
myList = sorted(myList, key=lambda x: int(x.split('.')[0]))
overlayList = [cv2.imread(f'{folderPath}/{imPath}') for imPath in myList if imPath.endswith(('.png', '.jpg'))]
print(f"Loaded {len(overlayList)} images.")
print(overlayList)

pTime = 0
detector = htm.handDetector()
tipIds = [4, 8, 12, 16, 20]

while True:
    success, img = cap.read()
    img = detector.findHands(img)
    lmList = detector.findPosition(img, draw=False)

    if len(lmList) >= max(tipIds):  # Ensure enough landmarks are detected
        fingers = []
        # Thumb Detection
        if lmList[tipIds[0]][1] > lmList[tipIds[0] - 1][1]:  # for thumb we need to take the x-coordinate.
            fingers.append(1)
        else:
            fingers.append(0)
        # Other Fingers
        for id in range(1, 5):
            fingers.append(1 if lmList[tipIds[id]][2] < lmList[tipIds[id] - 2][2] else 0)
            # [2] baigaagiin uchir ni y-coordinate--iig avch baina. yurn bol checking if the index of the finger is higher than the knuckle coordinate. if it is higher,that means it is not closed.
        #print(fingers)
        totalFingers = fingers.count(1)
        print(f"Fingers: {totalFingers}")

        h, w, c = overlayList[totalFingers - 1].shape
        img[0:h, 0:w] = overlayList[totalFingers-1] # index-eer avj baigaa bolohoor,index 0-ees ehlene geed ingej biana. tegeed 0 huruu bol -1 bolood,hamgiin suulchin huruu buyu,6dah zurag geh met.

        # Draw Green Rectangle with Finger Count
        cv2.rectangle(img, (20, 225), (170, 425), (0, 255, 0), cv2.FILLED)
        cv2.putText(img, str(totalFingers), (45, 375), cv2.FONT_HERSHEY_PLAIN,10, (255, 0, 0), 25)

    # FPS Calculation
    cTime = time.time()
    fps = 1 / (cTime - pTime)
    pTime = cTime

    cv2.putText(img, f'FPS: {int(fps)}', (400, 70), cv2.FONT_HERSHEY_PLAIN,3, (255, 0, 0), 3)
    cv2.imshow("Image", img)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()

