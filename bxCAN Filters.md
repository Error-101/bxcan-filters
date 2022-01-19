# bxCAN Filters

- [bxCAN Filters](#bxcan-filters)
  - [Theory](#theory)
    - [Setup](#setup)
    - [Config](#config)
    - [ID List Mode](#id-list-mode)
    - [Mask Mode](#mask-mode)
    - [Mapping IDs to the Registers](#mapping-ids-to-the-registers)
    - [Other useful info](#other-useful-info)
  - [Design](#design)
    - [0x0 - 0xF](#0x0---0xf)
    - [Even in 0x100 - 0x1FF](#even-in-0x100---0x1ff)
    - [UGR20 Wheel Speed](#ugr20-wheel-speed)
    - [Config and Activate](#config-and-activate)
  - [Test](#test)
    - [Full Test Code](#full-test-code)
    - [Expected Output](#expected-output)

## Theory

This assumes that you can already configure an STM for CAN and UART.

### Setup

To filter properly in bxCAN we will need the following variables. They are
pretty self explanatory but the `canfil` variable is what's really important for
filtering. We will use it to setup the filter settings later.

```c++
CAN_HandleTypeDef hcan1;              // CAN Bus master
CAN_TxHeaderTypeDef txHeader;         // CAN Bus Receive Header
uint8_t canRX[8] = {0,0,0,0,0,0,0,0}; // CAN Bus Receive Buffer
CAN_FilterTypeDef canfil;             // CAN Bus Filter
```

### Config

We can then configure the filter through the following settings:

```c++
canfil.FilterBank = 0 - 27 or 13;      // Filter to configure (max depends on platform)
canfil.FilterFIFOAssignment = CAN_RX_FIFO0 | CAN_RX_FIFO1; // Output FIFO
canfil.FilterScale = CAN_FILTERSCALE_32BIT | CAN_FILTERSCALE_16BIT; // Scale
canfil.FilterMode = CAN_FILTERMODE_IDMASK | CAN_FILTERMODE_IDLIST; // Mode
canfil.FilterActivation = ENABLE | DISABLE; // Enable
canfil.SlaveStartFilterBank = 0 - 27;  // Banks >= are for CAN 2 (only makes a difference on boards with 2 can terminals)

canfil.FilterIdHigh = 0;      // CAN_FxR1 top 2 bytes
canfil.FilterIdLow = 0;       // CAN_FxR1 bottom 2 bytes
canfil.FilterMaskIdHigh = 0;  // CAN_FxR2 top 2 bytes
canfil.FilterMaskIdLow = 0;   // CAN_FxR2 bottom 2 bytes
```

Now STM has up to 28 configurable filter banks that can be set into 1 of 4
different configuration. The configurations are based on 2 modes and 2 scales.

- ID List vs Mask mask
- 16 Bit vs 32 Bit scale

Basically, 16 bit can only filter a Standard IDs* whilst 32 bit can do Extended
too.

### ID List Mode

This settings is the simplest. The incoming ID is directly compared to up to 4
IDs per bank (2 in 32 bit scale). If it matches 1 of them it passes.

Each ID is stored in CAN_FxR1 and CAN_FxR2 and there is no real difference in
the role of FilterMaskIDxxxx vs FilterIdxxxx.

### Mask Mode

A bit more complicated. The filter works using the following test: `INCOMING &
MASK == ID`. Explicitly, this means the incoming ID is bitwise anded with
CAN_FxR2 and the result is compared to CAN_FxR1. As such, constructing a proper
mask will take some thought. Most notably, ranges are easiest to do when they
are a simple 2^n slices.

### Mapping IDs to the Registers

To complicate matters further, CAN_FxR1 and CAN_FxR2 hold the ID data in a
specific format.

![Filter Registers](./Filter%20Registers.png)

This means that we need to do some shifting get this into the right place.
Additionally, it shows that the Identification Extension (IDE) and Remote
Transmission Request (RTR) bits can be used in filters/

### Other useful info

After the filtering, a valid message (no CAN error and passes one of the
filters) will be passed to one of the 2 FIFOs, along with a number (filter
number) representing the filter that validated it. The number it will get
depends on the FIFO, filter bank number, and type. It starts at 0 and increments
as required. Below is an example, refer to the Filter registers image for more
info.

![Filter Numbering](./Filter%20Numbering.png)

Each FIFO can hold up to 3 messages and messages received after it's full are
lost. You can tie interrupts to the FIFO and/or mailbox to handle messages when
they arrive. For further customisation of response based on filter you can look
at the filter number after the message is received from the FIFO.

The last thing to watch out for is priority. Plainly, 32 bit > 16 bit then ID
List > ID Mask. When all else is equal, lower filter bank number = higher
priority.

## Design

Let's construct 4 filters giving to do the following:

- 0x0 - 0xF
- Even in 0x100 - 0x1FF
- 0x60 - 0x63 (UGR20 wheel speed)
  
We'll stick to standard ID's with no IDE or RTR checking to keep things simple

### 0x0 - 0xF

We know that the IDs need to pass `INCOMING & MASK = ID`. With that in mind we
should start at the mask. Setting a bit to 0 says "I don't care" (as it will
always output 0).

A standard ID is 11 bits long. To construct the mask, lets start by saying we
care about all bits:

Standard ID =  `0b??? ???? ???? ????`.

This is a good place to start, however, we want to allowing counting from `0x0`
to `0xF`. This corresponds to the full range of the bottom 4 bits. As such, we
don't actually care about those bits so we can set them to 0.

| Mask                   | Valid IDs              |
| ---------------------- | ---------------------- |
| `0bxxx xxxx xxxx 0000` | `0b??? ???? ???? xxxx` |

To ensure we are in the 0 -16 bit range the rest of the bits need to be 0.
Consequently, the mask bits needs to be 1.

| Mask                   | Valid IDs              |
| ---------------------- | ---------------------- |
| `0b111 1111 1111 0000` | `0b000 0000 0000 xxxx` |

That sets our mask as `0x7F0`. if we compare that to what valid inputs would be
(`x` = don't care), you can see that anything with a definiate value becomes `1`
and don't care becomes `0`.

We can then use the Valid IDs and the MASK to get the ID (`CAN_FxR1`) value.
bitewise and them and it will give the solution. In this case it will be `0x0`.

The table below shows what happens in hardware.

| INCOMING  | INCOMING && MASK |
| :-------: | :--------------: |
|   `0x0`   |      `0x0`       |
|   `0x1`   |      `0x0`       |
|   `0x2`   |      `0x0`       |
|   `0x3`   |      `0x0`       |
|   `0x4`   |      `0x0`       |
|   `0x5`   |      `0x0`       |
|   `0x6`   |      `0x0`       |
|   `0x7`   |      `0x0`       |
|   `0x9`   |      `0x0`       |
|   `0xA`   |      `0x0`       |
|   `0xB`   |      `0x0`       |
|   `0xC`   |      `0x0`       |
|   `0xD`   |      `0x0`       |
|   `0xE`   |      `0x0`       |
|   `0xF`   |      `0x0`       |
|  `0x10`   |      `0x10`      |
|  `0x11`   |      `0x10`      |
|    ...    |
| `0x20005` |     `0x2000`     |

From the table you should see that 0 would be the proper ID for this. You should
also note that the same MASK would be used for **any** simple 16 bit range. The
ID is used to select the one you desire.

```c++
canfil.FilterBank = 0;
canfil.FilterFIFOAssignment = CAN_RX_FIFO0; 
canfil.FilterScale = CAN_FILTERSCALE_16BIT;
canfil.FilterMode = CAN_FILTERMODE_IDMASK;
canfil.FilterActivation = ENABLE; 

// Filter number 0
canfil.FilterIdHigh = 0x7FF0 < 5; // Mask in 16 bit mode, shift for placement
canfil.FilterIdLow = 0;           // ID in 16 bit mode, shift for placement
```

### Even in 0x100 - 0x1FF

- A valid id looks like `0b000 0001 xxxx xxx0`
- Mask
  - Top 3 bits need to be 0 to be in the right range
  - Next 3 need to be 0001 to be in the right range
  - Last bit tells us if even or odd, hence final
  - All other bits don't matter
  - Therefore mask `0b111 1111 0000 0001` or `0x7F01`
- ID
  - Top 3 will come out 0 as 1 & 0 = 0
  - Next byte will come out as 1
  - Next byte always 0
  - Next byte must be 0 for even
  - Therefore id = `0x100`

```c++
// In 16 bit mode you can have 2 mask filters in 1 object
// Filter number 1
canfil.FilterMaskIdHigh = 0x7F01 < 5; // Mask in 16 bit mode, shift for placement
canfil.FilterMaskIdLow = 0x100 <5;    // ID in 16 bit mode, shift for placement
```

### UGR20 Wheel Speed

4 ID's, lets use a list.

```c++
canfil2.FilterBank = 1;
canfil2.FilterFIFOAssignment = CAN_RX_FIFO0; 
canfil2.FilterScale = CAN_FILTERSCALE_16BIT;
canfil2.FilterMode = CAN_FILTERMODE_IDLIST;
canfil2.FilterActivation = ENABLE; 

// Filters 2 - 5
canfil2.FilterIdHigh = 0x60 < 5;     // ID1 in 16 bit mode, shift for placement
canfil2.FilterIdLow = 0x61 < 5;      // ID2 in 16 bit mode, shift for placement
canfil2.FilterMaskIdHigh = 0x62 < 5; // ID5 in 16 bit mode, shift for placement
canfil2.FilterMaskIdLow = 0x63 < 5;  // ID4 in 16 bit mode, shift for placement
```

### Config and Activate

```c++
HAL_CAN_ConfigFilter(&hcan1,&canfil); //Initialize CAN Filter
HAL_CAN_ConfigFilter(&hcan1,&canfil2); //Initialize CAN Filter
HAL_CAN_Start(&hcan1); //Initialize CAN Bus
HAL_CAN_ActivateNotification(&hcan1,CAN_IT_RX_FIFO0_MSG_PENDING); // Initialize CAN Bus Rx Interrupt when message pending
```

The relevant CAN interrupts are:

| Interrupt                        | Callback                               | Comment                             |
| -------------------------------- | -------------------------------------- | ----------------------------------- |
| CAN_IT_RX_FIFO<0\|1>_MSG_PENDING | HAL_CAN_RxFifo<0\|1>MsgPendingCallback | FIFO 0\|1 message pending interrupt |
| CAN_IT_RX_FIFO<0\|1>_FULL        | HAL_CAN_RxFifo<0\|1>FullCallback       | FIFO 0\|1 full interrupt            |
| CAN_IT_RX_FIFO<0\|1>_OVERRUN     | Not too sure                           | FIFO 0\|1 overrun interrupt         |

## Test

Lets send some messages to test our filters.

Some TX and UART vars

```c++
// Tx Setup
CAN_TxHeaderTypeDef txHeader; //CAN Bus Receive Header
UART_HandleTypeDef huart2;
txHeader.DLC = 8; // Number of bites to be transmitted max- 8
txHeader.IDE = CAN_ID_STD;
txHeader.RTR = CAN_RTR_DATA;
txHeader.ExtId = 0x0;
txHeader.TransmitGlobalTime = DISABLE;
uint8_t csend1[8] = {'0','x','0','-','0','x','F','!'}
uint8_t csend2[8] = {'1','0','0','-','1','F','F','!'}
uint8_t csend3[8] = {'L','i','s','t','s','!','!','!'}
uint8_t csend4[8] = {'E','r','r','o','r','!','!','!'}
```

We can send some data every half second

```c++
int main() {
// Send valid then error
  while(1) {
    txHeader.StdId = 0x5;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend1,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x10;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend4,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x148;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend2,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x149;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend4,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x62;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend3,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x64;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend4,&canMailbox); // Send Message
    HAL_Delay(500);
  }
]
```

In the interrupt we can deal with give a unique response based on the filter
number.

```c++
void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcan1)
{
  HAL_CAN_GetRxMessage(hcan1, CAN_RX_FIFO0, &rxHeader, canRX); //Receive CAN bus message to canRX buffer
  uint8_t buffer[23];
  switch (b) {
    case 0:
      buffer = "First Mask  :";
      break;
    case 1:
      buffer = "Second Mask :";
      break;
    case 2:
    case 3:
    case 4:
    case 5:
      buffer = "List filter :";
      break;
    default:
      buffer = "Oh no       :";
  }
  std::copy(canRX,canRX+sizeof(canRX),buffer+14);
  
  // Bad, I know, but this is just for testing
  HAL_UART_Transmit(&huart2, buffer, sizeof(buffer), HAL_MAX_DELAY);

}
```

### Full Test Code

So the full STM32CubeIDE additions will looks something like the following. This
is the setup doesn't need a CAN network as we will work in LOOPBACK mode.

```c++
/* Private variables ---------------------------------------------------------*/
CAN_HandleTypeDef hcan1;

UART_HandleTypeDef huart2;

/* USER CODE BEGIN PV */
CAN_RxHeaderTypeDef rxHeader; //CAN Bus Transmit Header
CAN_TxHeaderTypeDef txHeader; //CAN Bus Receive Header
uint8_t canRX[8] = {0,0,0,0,0,0,0,0};  //CAN Bus Receive Buffer
CAN_FilterTypeDef canfil, canfil2; //CAN Bus Filter
...
int main(void)
{
  ...
  /* USER CODE BEGIN 2 */

  // Filters
  canfil.FilterBank = 0;
  canfil.FilterMode = CAN_FILTERMODE_IDMASK;
  canfil.FilterFIFOAssignment = CAN_RX_FIFO0;
  canfil.FilterScale = CAN_FILTERSCALE_32BIT;
  canfil.FilterActivation = ENABLE;

  // Filter number 0
  canfil.FilterIdHigh = 0x7FF0 < 5; // Mask in 16 bit mode, shift for placement
  canfil.FilterIdLow = 0;           // ID in 16 bit mode, shift for placement

  // In 16 bit mode you can have 2 mask filters in 1 object
  // Filter number 1
  canfil.FilterMaskIdHigh = 0x7F01 < 5; // Mask in 16 bit mode, shift for placement
  canfil.FilterMaskIdLow = 0x100 <5;    // ID in 16 bit mode, shift for placement

  canfil2.FilterBank = 1;
  canfil2.FilterFIFOAssignment = CAN_RX_FIFO0; 
  canfil2.FilterScale = CAN_FILTERSCALE_16BIT;
  canfil2.FilterMode = CAN_FILTERMODE_IDLIST;
  canfil2.FilterActivation = ENABLE; 

  // Filters 2 - 5
  canfil2.FilterIdHigh = 0x60 < 5;     // ID1 in 16 bit mode, shift for placement
  canfil2.FilterIdLow = 0x61 < 5;      // ID2 in 16 bit mode, shift for placement
  canfil2.FilterMaskIdHigh = 0x62 < 5; // ID5 in 16 bit mode, shift for placement
  canfil2.FilterMaskIdLow = 0x63 < 5;  // ID4 in 16 bit mode, shift for placement

  HAL_CAN_ConfigFilter(&hcan1,&canfil); //Initialize CAN Filter
  HAL_CAN_ConfigFilter(&hcan1,&canfil2); //Initialize CAN Filter
  HAL_CAN_Start(&hcan1); //Initialize CAN Bus
  HAL_CAN_ActivateNotification(&hcan1,CAN_IT_RX_FIFO0_MSG_PENDING); // Initialize CAN Bus Rx Interrupt when message pending

  // Header
  txHeader.DLC = 8; // Number of bites to be transmitted max- 8
  txHeader.IDE = CAN_ID_STD;
  txHeader.RTR = CAN_RTR_DATA;
  txHeader.ExtId = 0x0;
  txHeader.TransmitGlobalTime = DISABLE;
  uint8_t csend1[8] = {'0',' ','-',' ','1','5','!','!'}
  uint8_t csend2[8] = {'1','0','0','-','1','F','F','!'}
  uint8_t csend3[8] = {'L','i','s','t','s','!','!','!'}
  uint8_t csend4[8] = {'E','r','r','o','r','!','!','!'}

  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while(1) {
    /* USER CODE END WHILE */
    /* USER CODE BEGIN 3 */
    txHeader.StdId = 0x5;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend1,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x10;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend4,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x148;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend2,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x149;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend4,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x62;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend3,&canMailbox); // Send Message
    HAL_Delay(500);

    txHeader.StdId = 0x64;
    HAL_CAN_AddTxMessage(&hcan1,&txHeader,csend4,&canMailbox); // Send Message
    HAL_Delay(500);
  }
  /* USER CODE END 3*/
}
...
/* USER CODE BEGIN 4 */
void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcan1)
{
  HAL_CAN_GetRxMessage(hcan1, CAN_RX_FIFO0, &rxHeader, canRX); //Receive CAN bus message to canRX buffer
  uint8_t buffer[23];
  switch (b) {
    case 0:
      buffer = "First Mask  : ";
      break;
    case 1:
      buffer = "Second Mask : ";
      break;
    case 2:
    case 3:
    case 4:
    case 5:
      buffer = "List filter : ";
      break;
    default:
      buffer = "Oh no       : ";
  }
  std::copy(canRX,canRX+sizeof(canRX),buffer+14);
  buffer[23] = '\n';
  
  // Bad I know but this is just for testing
  HAL_UART_Transmit(&huart2, buffer, sizeof(buffer), HAL_MAX_DELAY);

}
/* USER CODE END 4 */
```

### Expected Output

Upload the script. If all goes well the following should be output to the serial
monitor at ~ 1 line/s.

```console
First Mask  : 0x0-0xF!
Second Mask : 100-1FF!
List Mode   : Lists!!!
```
